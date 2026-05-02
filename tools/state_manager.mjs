/** STATE MANAGER — Allows model to query available tools at runtime */
import { TOOL_CATALOG, isToolAtomic } from '../orchestrator/tool_catalog.mjs';
import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "state_manager",
        description: "Allow model to query available tools at runtime. Actions include list_tools, get_tool_info, and check_atomicity.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "enum",
                    enum: ["list_tools", "get_tool_info", "check_atomicity"],
                    description: "Action to perform: list_tools=show all tools, get_tool_info=get details about a tool, check_atomicity=verify if tool runs independently"
                },
                toolName: {
                    type: "string",
                    description: "Tool name for get_tool_info and check_atomicity actions"
                }
            },
            required: ["action"]
        }
    }
};

export async function handler(args) {
    try {
        const { action, toolName } = args;
        if (!action) return JSON.stringify({ error: "Требуется поле action" });

        switch (action) {
            case "list_tools":
                return JSON.stringify({
                    tools: TOOL_CATALOG.map(t => ({ name: t.name, purpose: t.purpose, isAtomic: t.isAtomic }))
                });
            
            case "get_tool_info": {
                const tool = TOOL_CATALOG.find(t => t.name === toolName);
                if (!tool) return JSON.stringify({ error: `Инструмент "${toolName}" не найден` });

                let info = { name: tool.name, purpose: tool.purpose };
                try {
                    const { TOOL_REQUIREMENTS } = await import('../orchestrator/tool_requirements.mjs');
                    Object.entries(TOOL_REQUIREMENTS).forEach(([n, v]) => {
                        if (n === toolName) info.requires = v.acceptsFrom;
                    });
                } catch {}
                return JSON.stringify(info);
            }

            case "check_atomicity": {
                if (!toolName || typeof toolName !== 'string') 
                    return JSON.stringify({ error: "Требуется поле toolName" });

                const isAtomic = TOOL_CATALOG.find(t => t.name === toolName)?.isAtomic ?? false;
                return JSON.stringify({ 
                    toolName, 
                    isAtomic, 
                    description: isAtomic ? "Атомичный инструмент" : "Требует предобработки" 
                });
            }

            default:
                return JSON.stringify({ error: `Неизвестное действие: ${action}` });
        }
    } catch (e) {
        log('ERROR', 'state_manager', 'error', e.message);
        return JSON.stringify({ error: `Ошибка state_manager: ${e.message}` });
    }
}
