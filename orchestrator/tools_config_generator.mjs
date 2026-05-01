/** 
 * TOOLS CONFIG GENERATOR — Analyzes tools for environment variable dependencies
 * Creates a dynamic config based on discovered process.env usage
 */

import fs from 'node:fs';
import path from 'node:path';

let generatedConfig = null;

/**
 * Finds all environment variable references in tool code
 */
function findEnvDependencies(code) {
  const matches = [...code.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)];
  return matches.map(m => m[1]);
}

/**
 * Generates configuration for all loaded tools
 */
export async function generateToolsConfig() {
  if (generatedConfig) return generatedConfig;
  
  const { getLoadedTools } = await import('./tools_loader.mjs');
  const loadedTools = getLoadedTools();
  
  const config = {};
  
  for (const [name, tool] of loadedTools) {
    // Read source file if available
    let code = '';
    try {
      // Try to find the original .mjs file from module paths
      if (tool.module && typeof tool.module === 'object' && tool.module.filename) {
        const filePath = path.join(path.dirname(tool.module.filename), '..', tool.module.filename);
        code = fs.readFileSync(filePath, 'utf-8');
      } else if (tool.definition.function?.name) {
        // Fallback: scan tools/ directory for matching file
        const fileName = `${tool.definition.function.name}.mjs`;
        const searchPath = path.join(path.dirname(tool.module.filename), '..', '..');
        const fullPath = path.join(searchPath, 'tools', fileName);
        
        if (fs.existsSync(fullPath)) {
          code = fs.readFileSync(fullPath, 'utf-8');
        }
      }
    } catch (e) {
      console.warn(`[CONFIG] Could not read source for ${name}:`, e.message);
    }
    
    // Check for process.env dependencies
    const envVars = findEnvDependencies(code).sort();
    
    if (envVars.length > 0) {
      config[name] = {
        requiredEnvVars: [...new Set(envVars)],
        defaultValues: {},
        optionalParams: Object.fromEntries(
          envVars.map(v => [v, true])
        )
      };
      
      // Mark which vars are actually set in process.env
      for (const envVar of config[name].requiredEnvVars) {
        const value = process.env[envVar];
        if (value !== undefined && value !== '') {
          config[name].defaultValues[envVar] = value;
        }
      }
    }
  }
  
  generatedConfig = config;
  return config;
}

/**
 * Gets the generated configuration or writes to file
 */
export function saveToolsConfigToFile(filePath = 'orchestrator/tools.config.json') {
  const config = generateToolsConfig();
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  console.log(`[CONFIG] Saved ${Object.keys(config).length} tool configs to ${filePath}`);
  return config;
}

/**
 * Loads configuration from file (for debugging)
 */
export function loadToolsConfigFromFile(filePath = 'orchestrator/tools.config.json') {
  if (!fs.existsSync(filePath)) {
    console.warn(`[CONFIG] Config file not found: ${filePath}`);
    return generateToolsConfig();
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Checks if a tool has optional parameters from env vars
 */
export function getToolOptionalParams(toolName) {
  try {
    const config = generateToolsConfig();
    return config[toolName]?.optionalParams || {};
  } catch (e) {
    return {};
  }
}

export default {
  generateToolsConfig,
  saveToolsConfigToFile,
  loadToolsConfigFromFile,
  getToolOptionalParams
};
