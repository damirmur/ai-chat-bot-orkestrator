export const definition = {
    type: "function",
    function: {
        name: "agent_fin_period_table_graph",
        description: "Построить график или таблицу для финансовых данных за период. Агент сам выберет формат вывода: draw_chart или render_table.",
        parameters: {
            type: "object",
            properties: {
                steps: {
                    type: "array",
                    description: "Массив шагов: получить данные → построить график/таблицу",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "number", description: "ID шага" },
                            tool: { type: "string", description: "Название инструмента" },
                            args: { type: "object", description: "Аргументы для инструмента" }
                        },
                        required: ["id", "tool", "args"]
                    }
                }
            },
            required: ["steps"]
        }
    }
};

export async function handler(args, toolsHandlers) {
    const steps = args.steps;
    
    if (!Array.isArray(steps)) {
        return JSON.stringify({ error: "steps должен быть массивом" });
    }
    
    if (steps.length === 0) {
        return JSON.stringify({ error: "План пуст" });
    }
    
    console.log(`[agent_fin_period_table_graph] Начинаю выполнение ${steps.length} шагов...`);
    
    const results = {};
    
    for (const step of steps) {
        const { id, tool, args: stepArgs } = step;
        console.log(`[agent_fin_period_table_graph] Шаг ${id}: ${tool}...`);
        
        if (!toolsHandlers[tool]) {
            const error = { error: `Инструмент "${tool}" не найден`, step: id };
            console.error(`[agent_fin_period_table_graph] Ошибка на шаге ${id}: ${error.error}`);
            return JSON.stringify(error);
        }
        
        let processedArgs = stepArgs;
        
        // draw_chart - автообработка данных из предыдущего шага
        if (tool === "draw_chart" && stepArgs.source !== undefined && stepArgs.key_labels && stepArgs.key_values) {
            const sourceResult = results[stepArgs.source]?.result;
            if (sourceResult && sourceResult.history) {
                // Используем dateLabel если есть, иначе date
                const labels = sourceResult.history[0]?.dateLabel 
                    ? sourceResult.history.map(d => d.dateLabel)
                    : sourceResult.history.map(d => d[stepArgs.key_labels]);
                
                processedArgs = {
                    title: stepArgs.title,
                    labels: labels,
                    values: sourceResult.history.map(d => d[stepArgs.key_values]),
                    currency: sourceResult.currency || 'USD'
                };
                console.log(`[agent_fin_period_table_graph] draw_chart: ${sourceResult.history.length} точек, labels: ${labels.join(', ')}`);
            }
        }
        
        // render_table - автообработка
        if (tool === "render_table" && stepArgs.source !== undefined) {
            const sourceResult = results[stepArgs.source]?.result;
            if (sourceResult && sourceResult.history) {
                processedArgs = {
                    title: stepArgs.title || "Данные",
                    data: sourceResult.history
                };
                console.log(`[agent_fin_period_table_graph] render_table: ${sourceResult.history.length} строк`);
            } else if (sourceResult && Array.isArray(sourceResult)) {
                processedArgs = {
                    title: stepArgs.title || "Данные",
                    data: sourceResult
                };
                console.log(`[agent_fin_period_table_graph] render_table: ${sourceResult.length} строк`);
            } else {
                console.log(`[agent_fin_period_table_graph] render_table: нет данных`);
            }
        }
        
        let resultStr;
        if (tool.startsWith("agent_")) {
            resultStr = await toolsHandlers[tool](processedArgs, toolsHandlers);
        } else {
            resultStr = await toolsHandlers[tool](processedArgs);
        }
        
        let result;
        try {
            result = JSON.parse(resultStr);
        } catch {
            result = resultStr;
        }
        
        results[id] = { tool, result };
        console.log(`[agent_fin_period_table_graph] Шаг ${id} выполнен`);
    }
    
    const lastStep = steps[steps.length - 1];
    const lastResult = results[lastStep.id].result;
    
    console.log(`[agent_fin_period_table_graph] Выполнение завершено`);
    
    // Собираем изображения
    const allImages = [];
    for (const [id, data] of Object.entries(results)) {
        if (data.result?.image && data.result.image.startsWith('data:')) {
            allImages.push({
                step: id,
                tool: data.tool,
                image: data.result.image,
                title: data.result.title
            });
        }
    }
    
    if (allImages.length > 0) {
        console.log(`[agent_fin_period_table_graph] Найдено изображений: ${allImages.length}`);
        if (allImages.length === 1) {
            return JSON.stringify(allImages[0]);
        } else {
            return JSON.stringify({ images: allImages });
        }
    }
    
    // Авто-определение вывода
    let autoOutput = autoDetectAndRender(lastResult);
    if (autoOutput) {
        console.log(`[agent_fin_period_table_graph] Авто-определение: ${autoOutput.type}`);
        
        if (autoOutput.type === 'chart' && toolsHandlers['draw_chart']) {
            const chartResult = await toolsHandlers['draw_chart']({
                title: autoOutput.title,
                labels: autoOutput.labels,
                values: autoOutput.values,
                currency: lastResult.currency || 'USD'
            });
            try { return chartResult; } catch { return JSON.stringify(lastResult); }
        }
        
        if (autoOutput.type === 'table' && toolsHandlers['render_table']) {
            const tableResult = await toolsHandlers['render_table']({
                title: autoOutput.title,
                data: autoOutput.data
            });
            try { return tableResult; } catch { return JSON.stringify(lastResult); }
        }
    }
    
    return JSON.stringify(lastResult);
}

function autoDetectAndRender(result) {
    if (!result) return null;
    
    if (result.image && result.image.startsWith('data:')) {
        return { type: 'image', data: result };
    }
    
    if (result.history && Array.isArray(result.history) && result.history.length > 0) {
        const first = result.history[0];
        const hasDate = 'date' in first;
        const hasValue = 'price' in first || 'close' in first || 'value' in first;
        
        if (hasDate && hasValue) {
            const labels = result.history[0]?.dateLabel
                ? result.history.map(d => d.dateLabel)
                : result.history.map(d => d.date);
            return {
                type: 'chart',
                title: result.symbol || 'График',
                labels: labels,
                values: result.history.map(d => Number(d.price || d.close || d.value) || 0)
            };
        }
        
        return {
            type: 'table',
            title: result.symbol || 'Таблица',
            data: result.history
        };
    }
    
    if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
        return {
            type: 'table',
            title: 'Таблица',
            data: result
        };
    }
    
    return null;
}