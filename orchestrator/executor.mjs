import { log } from '../logger.mjs';

// Simple executor for plan steps (cognitive loop mode)
export async function executePlan(steps, toolsHandlers) {
    const results = [];
    
    for (const step of steps) {
        try {
            if (!step.tool) {
            log('WARN', 'executor', 'missing_tool', `Step missing tool definition: ${JSON.stringify(step)}`);
            continue;
        }
        let fn = toolsHandlers[step.tool];
    if (!fn) {
        // Fallback: retrieve from loaded tools map (handlers are stored there)
        const { getLoadedTools } = await import('./tools_loader.mjs');
        const loaded = getLoadedTools().get(step.tool);
        if (loaded) fn = loaded.handler;
    }
    if (typeof fn !== 'function') {
        throw new Error(`Tool handler for '${step.tool}' not found or not a function`);
    }
    const result = await fn(step.args, toolsHandlers);
            results.push({ tool: step.tool, args: step.args, result });
        } catch (error) {
            log('ERROR', 'executor', 'step_error', `${step.tool}: ${error.message}`);
            throw error;
        }
    }
    
    return results;
}

export function processFinanceStep(step, stepResults) {
    const { tool, args } = step;
    let processedArgs = args ? { ...args } : {};
    
    if (processedArgs.source !== undefined) {
        // Handle multi-source data...
        throw new Error('Multi-source finance steps not yet supported');
    }
    
    return processedArgs;
}

export function processToolStep(step, toolsHandlers) {
    const { tool, args } = step;
    try {
        if (!toolsHandlers[tool]) {
            throw new Error(`Unknown tool: ${tool}`);
        }
        return toolsHandlers[tool](args || {});
    } catch (error) {
        log('ERROR', 'executor', 'tool_error', `${tool}: ${error.message}`);
        throw error;
    }
}
