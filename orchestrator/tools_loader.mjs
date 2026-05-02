/** 
 * TOOLS LOADER — Centralized tool registration and validation
 * Auto-discovers and loads all .mjs files from tools/ directory
 */

import { log } from '../logger.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let loadedTools = new Map();

export function getLoadedTools() {
    return loadedTools;
}

/**
 * Finds environment variable references in source code
 */
function findEnvVariablesInSource(sourceCode) {
    const regex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
    const matches = [...sourceCode.matchAll(regex)];
    return [...new Set(matches.map(m => m[1]))];
}

/**
 * Updates definition to add optional parameters from env variables
 */
function updateDefinitionWithOptionalParams(definition, envVars) {
    if (!Array.isArray(envVars)) {
        return definition;
    }
    
    const newProperties = {};
    
    // Support both flat and nested structures
    if (definition.parameters?.properties) {
        // Flat structure: definition.parameters.properties
        Object.assign(newProperties, definition.parameters.properties);
    } else if (definition.function?.parameters?.properties) {
        // Nested structure: definition.function.parameters.properties
        Object.assign(newProperties, definition.function.parameters.properties);
    }
    
    for (const envVar of envVars) {
        newProperties[envVar] = {
            type: "string",
            description: `Опциональный параметр (по умолчанию из ${envVar})`
        };
    }
    
    if (definition.parameters?.properties) {
        // Flat structure
        return {
            ...definition,
            parameters: {
                ...definition.parameters,
                properties: newProperties
            }
        };
    } else if (definition.function?.parameters?.properties) {
        // Nested structure
        const updatedParams = {
            ...definition.function.parameters,
            properties: newProperties
        };
        
        return {
            ...definition,
            function: updatedParams
        };
    }
    
    return definition;
}

/**
 * Wraps handler to add optional parameters from process.env if not provided in args
 */
function wrapHandlerWithEnvFallback(originalHandler, envVars) {
    // Cache for values loaded from environment
    const cachedValues = new Map();
    
    return async function wrappedHandler(args, toolsHandlers) {
        const filledArgs = { ...args };
        
        for (const envVar of envVars) {
            // Only fill from env if:
            // 1. Parameter not provided in args, AND
            // 2. Variable is actually set in process.env
            if (!(envVar in filledArgs)) {
                const value = process.env[envVar];
                if (value !== undefined && value !== '') {
                    cachedValues.set(envVar, value);
                    log('INFO', 'ORCHESTRATOR', 'env_loaded_from_env', `${envVar}`);
                    filledArgs[envVar] = value;
                } else {
                    // Try to use cached value if available
                    const cachedValue = cachedValues.get(envVar);
                    if (cachedValue) {
                        log('INFO', 'ORCHESTRATOR', 'env_loaded_from_cache', `${envVar}`);
                        filledArgs[envVar] = cachedValue;
                    } else {
                        log('WARN', 'ORCHESTRATOR', 'env_not_set', `${envVar} is not set`);
                    }
                }
            }
        }
        
        // Pass toolsHandlers through if provided
        return originalHandler(filledArgs, toolsHandlers);
    };
}

/**
 * Loads all tools from the tools/ directory
 */
export async function loadAllTools(basePath = 'tools') {
    console.log('[TOOLS LOADER] Discovering tools in:', basePath);
    
    try {
        const cwd = process.cwd();
        
        if (!fs.existsSync(cwd)) {
            throw new Error(`Current working directory not found: ${cwd}`);
        }

        let searchDirs = [];
        const dirsToCheck = [basePath, basePath + '/tls', 'tls'];
        
        for (const dir of dirsToCheck) {
            if (fs.existsSync(path.join(cwd, dir))) {
                searchDirs.push(dir);
                console.log(`[TOOLS LOADER] Found directory: ${dir}`);
            }
        }

        let allFiles = [];
        const seenPaths = new Set();
        
        for (const dir of searchDirs) {
            const fullPath = path.join(cwd, dir);
            const files = fs.readdirSync(fullPath)
                .filter(file => file.endsWith('.mjs'))
                .map(file => `${dir}/${file}`);
            
            for (const file of files) {
                if (!seenPaths.has(file)) {
                    seenPaths.add(file);
                    allFiles.push(file);
                }
            }
        }

        const uniqueFiles = Array.from(seenPaths);
        
        if (uniqueFiles.length === 0) {
            throw new Error(`No .mjs files found in ${basePath} or tls`);
        }

        log('INFO', 'ORCHESTRATOR', 'tools_discovered_count', `Found ${uniqueFiles.length} tool file(s)`);

        for (const file of uniqueFiles) {
            const filePath = path.join(cwd, file.split('/').slice(0, -1).join('/'), file.split('/').pop());
            
            log('INFO', 'ORCHESTRATOR', 'tool_loading_start', `Loading: ${file}`);
            
            try {
                const module = await import('file://' + filePath.replace(/\\/g, '/'));
                
                if (!module.definition || !module.handler) {
                    console.warn(`[TOOLS LOADER] Skipping ${file}: missing definition or handler`);
                    continue;
                }

                validateDefinition(module.definition, file);

                const toolName = getToolName(module.definition);
                
                // Find environment variable dependencies in the source code
                let envDependencies = [];
                try {
                    const sourceCode = fs.readFileSync(filePath, 'utf-8');
                    envDependencies = findEnvVariablesInSource(sourceCode);
                    
                    if (envDependencies.length > 0) {
                        console.log(`[TOOLS LOADER] 🌍 ${toolName} depends on: ${envDependencies.join(', ')}`);
                    }
                } catch (e) {
                    // Ignore errors reading source file
                }

                loadedTools.set(toolName, {
                    module,
                    definition: updateDefinitionWithOptionalParams(module.definition, envDependencies),
                    handler: wrapHandlerWithEnvFallback(module.handler, envDependencies)
                });

                console.log(`[TOOLS LOADER] ✅ Loaded: ${toolName}`);
            } catch (error) {
                console.error(`[TOOLS LOADER] ❌ Failed to load ${file}:`, error.message);
            }
        }

        return loadedTools.size;

    } catch (error) {
        console.error('[TOOLS LOADER] Error:', error.message);
        throw error;
    }
}

/**
 * Validates tool definition structure
 */
function validateDefinition(definition, fileName) {
    if (!definition.type || definition.type !== 'function') {
        log('WARN', 'ORCHESTRATOR', 'tool_missing_type', `Warning in ${fileName}: missing or invalid "type" field`);
    }

    if (definition.function && !definition.name && !definition.parameters) {
        const fn = definition.function;
        if (!fn.name || !fn.description || !fn.parameters) {
            log('WARN', 'ORCHESTRATOR', 'tool_incomplete_structure', `Warning in ${fileName}: incomplete function structure`);
        }
    } else if (definition.name && definition.parameters) {
        if (!definition.type) {
            log('WARN', 'ORCHESTRATOR', 'tool_missing_type_flat', `Warning in ${fileName}: missing "type" field in flat format`);
        }
    }

    return true;
}

/**
 * Extracts tool name from definition
 */
function getToolName(definition) {
    if (definition.function?.name) {
        return definition.function.name;
    }
    
    if (definition.name) {
        return definition.name;
    }
    
    const name = definition.function?.function?.name || 
                  Object.keys(definition.parameters)[0] || 
                  import.meta.filename.replace(/\.mjs$/, '');
    log('WARN', 'ORCHESTRATOR', 'tool_name_fallback', `Warning: no clear tool name, using fallback: "${name}"`);
    return name;
}

/**
 * Gets a specific tool by name
 */
export function getTool(toolName) {
    const tool = loadedTools.get(toolName);
    
    if (!tool) {
        log('WARN', 'ORCHESTRATOR', 'tool_not_found', `Tool not found: ${toolName}`);
        return null;
    }

    return tool;
}

/**
 * Gets all available tools as array
 */
export function getAllTools() {
    const result = [];
    
    loadedTools.forEach((tool, name) => {
        result.push({
            name,
            definition: tool.definition
        });
    });

    return result;
}

/**
 * Generates and saves configuration file with tool dependencies
 */
export async function generateAndSaveToolConfig(filePath = 'orchestrator/tools.config.json') {
    const config = {};
    
    for (const [name, tool] of loadedTools) {
        let envVars = [];
        
        try {
            // Try to find the original source file from module paths or by name
            if (tool.module && typeof tool === 'object' && tool.filename) {
                const codePath = path.join(path.dirname(tool.filename), '..', tool.filename);
                const code = fs.readFileSync(codePath, 'utf-8');
                envVars = findEnvVariablesInSource(code);
                
                console.log(`[CONFIG] Found source for ${name}:`, codePath);
            } else {
                // Fallback: search by filename in tools/ directory
                if (tool.definition.function?.name) {
                    const fileName = `${tool.definition.function.name}.mjs`;
                    const fullPath = path.join('tools', fileName);
                    
                    if (fs.existsSync(fullPath)) {
                        envVars = findEnvVariablesInSource(fs.readFileSync(fullPath, 'utf-8'));
                        console.log(`[CONFIG] Found source for ${name}:`, fullPath);
                    } else {
                        const altPath = path.join('..', '..', 'tools', fileName);
                        if (fs.existsSync(altPath)) {
                            envVars = findEnvVariablesInSource(fs.readFileSync(path.resolve(altPath), 'utf-8'));
                            console.log(`[CONFIG] Found source for ${name}:`, altPath);
                        } else {
                            console.warn(`[CONFIG] Source not found for ${name}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`[CONFIG] Could not read source for ${name}:`, e.message);
        }
        
        if (envVars.length > 0) {
            const defaultValues = {};
            for (const envVar of envVars) {
                const value = process.env[envVar];
                if (value !== undefined && value !== '') {
                    defaultValues[envVar] = value;
                }
            }
            
            config[name] = {
                requiredEnvVars: [...new Set(envVars)].sort(),
                defaultValues,
                optionalParams: Object.fromEntries(
                    envVars.map(v => [v, true])
                )
            };
        }
    }
    
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    console.log(`[CONFIG] ✅ Saved ${Object.keys(config).length} tool configs to ${filePath}`);
    return config;
}

// Export handlers for use by other modules
export const exportedHandlers = {};
getLoadedTools().forEach((tool, name) => {
    global[name] = tool.handler;
    exportedHandlers[name] = tool.handler;
});

/**
 * Loads configuration file (for manual inspection/debugging)
 */
export function loadToolConfigFromFile(filePath = 'orchestrator/tools.config.json') {
    if (!fs.existsSync(filePath)) {
        console.warn(`[CONFIG] Config file not found: ${filePath}, will be generated on next run`);
        return {};
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
}

export default {
    loadAllTools,
    getTool,
    getAllTools,
    generateAndSaveToolConfig,
    exportedHandlers,
    loadedTools
};
