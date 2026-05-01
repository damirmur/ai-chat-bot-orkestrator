/**
 * TOOL REQUIREMENTS DATABASE — Detailed specifications for executor validation
 * NOT shown to model - used only by cognitive_loop/executor for compatibility checking
 */

export const TOOL_REQUIREMENTS = {
    // === API TOOLS CONSUME DATA, RETURN FINAL RESULTS ===
    
    weather_api: {
        name: "weather_api",
        
        inputs: [
            { field: "lat", type: "number", required: true },
            { field: "lon", type: "number", required: true }
        ],
        
        acceptsFrom: ["fact_lookup", "api_formatter", "$[0].lat"],
        rejectsDirectlyFrom: ["web_search", "model_tool"], // Raw text not usable
        
        outputs: { temperature: "string", condition: "string" },
        isFinalResult: true
    },
    
    get_finance_data: {
        name: "get_finance_data",
        
        inputs: [
            { field: "symbol", type: "string", required: true },
            { field: "type", type: "enum", values: ["current", "historical"], required: false }
        ],
        
        acceptsFrom: ["date_period", "$[0].startDate"],
        rejectsDirectlyFrom: ["web_search"],
        
        outputs: { price: "number", history: "array" },
        isFinalResult: true
    },
    
    draw_chart: {
        name: "draw_chart",
        
        inputs: [
            { field: "labels", type: "array[string]", required: true },
            { field: "values", type: "array[number]", required: true }
        ],
        
        acceptsFrom: ["date_period", "$[0].labels", "$[1].history"],
        rejectsDirectlyFrom: [], // Only structured data accepted
        
        outputs: { image: "base64_png" },
        isFinalResult: true
    },
    
    render_table: {
        name: "render_table",
        
        inputs: [
            { field: "data", type: "array[object]", required: true }
        ],
        
        acceptsFrom: ["fact_extractor", "$[0].history"],
        rejectsDirectlyFrom: ["web_search"], // Raw text not usable
        
        outputs: { image: "base64_png" },
        isFinalResult: true
    },
    
    reply: {
        name: "reply",
        
        inputs: [
            { field: "text", type: "string", required: true }
        ],
        
        acceptsFrom: [], // No data needed
        
        outputs: { text: "string" },
        isFinalResult: true
    },
    
    shell_command: {
        name: "shell_command",
        
        inputs: [
            { field: "command", type: "string", required: true }
        ],
        
        acceptsFrom: [],
        rejectsDirectlyFrom: [],
        
        outputs: { output: "string", error: "string|null" },
        isFinalResult: true,
        securityCheck: "peerId must equal USER_ID" // Critical constraint!
    },
    
    model_tool: {
        name: "model_tool",
        
        inputs: [
            { field: "action", type: "enum", values: ["translate", "summarize", "analyze", "format", "extract", "compare", "explain"], required: true },
            { field: "text", type: "string", required: true }
        ],
        
        acceptsFrom: ["web_search", "$[0]", "$[1]"], // Any text source
        
        outputs: { text: "string" },
        isFinalResult: false // Usually intermediate result
    },
    
    // === DATA PROCESSING TOOLS RETURN INTERMEDIATE RESULTS ===
    
    fact_lookup: {
        name: "fact_lookup",
        
        inputs: [
            { field: "query", type: "string", required: true }
        ],
        
        acceptsFrom: [], // No data needed
        
        outputs: { lat: "number|null", lon: "number|null" },
        isFinalResult: false // Data for API tools
    },
    
    web_search: {
        name: "web_search", 
        
        inputs: [
            { field: "query", type: "string", required: true }
        ],
        
        acceptsFrom: [], // No data needed
        
        outputs: { 
            title: "string|null", 
            snippet: "string", 
            html_content: "string",
            url: "string"
        },
        isFinalResult: false,
        rawOutput: true // ⚠️ ALWAYS RAW! Requires fact_extractor before any API use!
    },
    
    fact_extractor: {
        name: "fact_extractor", 
        
        inputs: [
            { field: "text", type: "string", required: true },
            { field: "targetField", type: "enum", values: ["coordinates", "prices", "titles"], required: true }
        ],
        
        acceptsFrom: ["web_search"], // Raw text is expected
        
        outputs: { 
            city: "string", 
            lat: "number|string", 
            lon: "number|string",
            price: "number|string"
        },
        isFinalResult: false, // Still needs api_formatter for API compatibility
        requiresFormattingFor: ["weather_api"] // Example: coordinates need number conversion
    },
    
    api_formatter: {
        name: "api_formatter", 
        
        inputs: [
            { field: "extractedData", type: "object", required: true },
            { field: "targetTool", type: "string", required: true } // e.g., 'weather_api'
        ],
        
        acceptsFrom: ["fact_extractor"], // Processed data expected
        
        outputs: { lat: "number", lon: "number" }, // Example for weather_api
        isFinalResult: false, // Ready for target API, not final answer
        preparesFor: ["weather_api", "get_finance_data"]
    }
};

// === VALIDATION HELPERS ===

/**
 * Check if target tool can accept output from source tool
 */
export function canToolAcceptFrom(sourceToolName, targetToolName) {
    const target = TOOL_REQUIREMENTS[targetToolName];
    if (!target || !target.acceptsFrom) return false;
    
    // Direct match
    if (target.acceptsFrom.includes(sourceToolName)) return true;
    
    // Generic field reference like "$[0].lat"
    const hasFieldMatch = target.acceptsFrom.some(ref => {
        if (!ref.startsWith('$')) return false;
        const fieldName = ref.split('.').pop();
        return target.inputs?.some(inp => inp.field === fieldName);
    });
    
    return hasFieldMatch;
}

/**
 * Get incompatible tool pairs (for planning validation)
 */
export function getIncompatiblePairs() {
    const incompatible = [];
    
    Object.entries(TOOL_REQUIREMENTS).forEach(([toolName, requirements]) => {
        if (!requirements.rejectsDirectlyFrom) return;
        
        requirements.rejectsDirectlyFrom.forEach(rejectedSource => {
            incompatible.push({
                target: toolName,
                source: rejectedSource,
                reason: `Tool ${toolName} requires formatted input but ${rejectedSource} returns raw data.` +
                       (requirements.inputs?.length > 0 ? 
                           ` Expected: ${JSON.stringify(requirements.inputs)}` : '')
            });
        });
    });
    
    return incompatible;
}

/**
 * Validate a step chain before execution
 */
export function validateStepChain(steps, previousResults = []) {
    const errors = [];
    
    for (let i = 1; i < steps.length; i++) {
        const currentStep = steps[i];
        const prevStep = steps[i-1];
        
        if (!prevStep.tool || !currentStep.tool) continue;
        
        // Check if current tool can accept from previous tool's output
        if (!canToolAcceptFrom(prevStep.tool, currentStep.tool)) {
            const target = TOOL_REQUIREMENTS[currentStep.tool];
            errors.push({
                stepIndex: i,
                message: `Cannot use ${prevStep.tool} result directly with ${currentStep.tool}.` +
                        (target?.rejectsDirectlyFrom ? 
                            ` ${target.rejectsDirectlyFrom.join(', ')} require processing first.` : ''),
                suggestion: prevStep.tool === 'web_search' && currentStep.tool === 'weather_api' ?
                    'Add fact_extractor → api_formatter chain between web_search and weather_api' : null
            });
        }
    }
    
    return errors;
}

// Expose all helpers at module level for easy access
export { isToolAtomic, getToolsRequiringProcessing } from './tool_catalog.mjs';
