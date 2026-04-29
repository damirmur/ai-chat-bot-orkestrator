export async function executePlan(plan, toolsHandlers) {
    const results = [];
    
    if (!plan || !Array.isArray(plan) || plan.length === 0) {
        return results;
    }
    
    // stepResults - хранит результаты по index (для source)
    const stepResults = [];
    
    for (let i = 0; i < plan.length; i++) {
        const step = plan[i];
        const { tool, args } = step;
        console.log(`[Executor] Шаг ${i}: ${tool}`);
        
        if (!toolsHandlers[tool]) {
            console.error(`[Executor] Инструмент ${tool} не найден`);
            results.push({ step: i, toolName: tool, result: JSON.stringify({ error: `Инструмент ${tool} не найден` }) });
            continue;
        }
        
        // Обработка source - передача данных в инструмент
        let processedArgs = args ? { ...args } : {};
        
        if (processedArgs.source !== undefined) {
            const sourceIdx = processedArgs.source;
            let sourceData = [];
            
            if (Array.isArray(sourceIdx)) {
                // Массив source: собираем данные из всех указанных шагов
                sourceData = sourceIdx.map(idx => {
                    const res = stepResults[idx];
                    if (!res) return null;
                    try { 
                        return typeof res === 'string' ? JSON.parse(res) : res; 
                    } catch(e) { 
                        console.error(`[Executor] Ошибка парсинга source ${idx}: ${e.message}`);
                        return null; 
                    }
                }).filter(x => x !== null);
            } else if (!isNaN(sourceIdx) && stepResults[sourceIdx]) {
                // Одиночный source
                const res = stepResults[sourceIdx];
                try {
                    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
                    sourceData = [parsed];
                } catch(e) {
                    console.error(`[Executor] Ошибка парсинга source ${sourceIdx}: ${e.message}`);
                    sourceData = [];
                }
            } else {
                console.log(`[Executor] source ${sourceIdx} не найден`);
            }
            
            if (sourceData.length > 0) {
                processedArgs.sourceData = sourceData;
                console.log(`[Executor] Передано sourceData (${sourceData.length} источников) в инструмент ${tool}`);
            }
            
            delete processedArgs.source;
        }
        
        try {
            let result;
            
            // Агенты и модель_tool получают toolsHandlers (где есть askLM)
            if (tool.startsWith('agent_') || tool === 'model_tool') {
                result = await toolsHandlers[tool](processedArgs, toolsHandlers);
            } else {
                result = await toolsHandlers[tool](processedArgs);
            }
            
            stepResults[i] = result;
            results.push({ step: i, toolName: tool, result });
            console.log(`[Executor] Шаг ${i} выполнен`);
            
        } catch (e) {
            console.error(`[Executor] Ошибка шага ${i}: ${e.message}`);
            results.push({ step: i, toolName: tool, result: JSON.stringify({ error: e.message }) });
        }
    }
    
    return results;
}
