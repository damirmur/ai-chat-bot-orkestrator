export const definition = {
    type: "function",
    function: {
        name: "execute_plan",
        description: "Выполнить план из нескольких шагов. Каждый шаг содержит tool и args. Результаты подставляются через {{steps.X.field}}.",
        parameters: {
            type: "object",
            properties: {
                steps: {
                    type: "array",
                    description: "Массив шагов для выполнения. Пример: [{\"id\": 0, \"tool\": \"get_time\", \"args\": {}}]",
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
    
    console.log(`[ Plan ] Начинаю выполнение ${steps.length} шагов...`);
    
    const results = {};
    
    for (const step of steps) {
        const { id, tool, args: stepArgs } = step;
        console.log(`[ Plan ] Шаг ${id}: ${tool}...`);
        
        if (!toolsHandlers[tool]) {
            const error = { error: `Инструмент "${tool}" не найден`, step: id };
            console.error(`[ Plan ] Ошибка на шаге ${id}: ${error.error}`);
            return JSON.stringify(error);
        }
        
        let processedArgs = stepArgs;
        
        // Особый случай для draw_chart - автообработка
        if (tool === "draw_chart" && stepArgs.source !== undefined && stepArgs.key_labels && stepArgs.key_values) {
            const sourceResult = results[stepArgs.source]?.result;
            if (sourceResult && sourceResult.history) {
                processedArgs = {
                    title: stepArgs.title,
                    labels: sourceResult.history.map(d => d[stepArgs.key_labels]),
                    values: sourceResult.history.map(d => d[stepArgs.key_values])
                };
                console.log(`[ Plan ] draw_chart: ${sourceResult.history.length} точек`);
            }
        }
        
        // Особый случай для render_table - автообработка
        if (tool === "render_table" && stepArgs.source !== undefined) {
            const sourceResult = results[stepArgs.source]?.result;
            if (sourceResult && sourceResult.history) {
                processedArgs = {
                    title: stepArgs.title || "Данные",
                    data: sourceResult.history
                };
                console.log(`[ Plan ] render_table: ${sourceResult.history.length} строк`);
            } else if (sourceResult && Array.isArray(sourceResult)) {
                // Массив напрямую
                processedArgs = {
                    title: stepArgs.title || "Данные",
                    data: sourceResult
                };
                console.log(`[ Plan ] render_table: ${sourceResult.length} строк`);
            } else {
                console.log(`[ Plan ] render_table: нет данных (sourceResult =`, typeof sourceResult);
            }
        }
        
        // Особый случай для execute_plan - НЕ передаём toolsHandlers (защита от рекурсии)
        let resultStr;
        if (tool === "execute_plan") {
            resultStr = await toolsHandlers[tool](processedArgs, {});
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
        console.log(`[ Plan ] Шаг ${id} выполнен успешно`);
    }
    
    const lastStep = steps[steps.length - 1];
    const lastResult = results[lastStep.id].result;
    
    console.log(`[ Plan ] Выполнение завершено`);
    
    // Собираем ВСЕ изображения из шагов
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
        console.log(`[ Plan ] Найдено изображений: ${allImages.length}`);
        // Возвращаем первое изображение (или массив, если несколько)
        if (allImages.length === 1) {
            return JSON.stringify(allImages[0]);
        } else {
            return JSON.stringify({ images: allImages });
        }
    }
    
    // Авто-определение типа вывода (если нет изображений)
    let autoOutput = autoDetectAndRender(lastResult);
    if (autoOutput) {
        console.log(`[ Plan ] Авто-определение:`, autoOutput.type);
        
        // Выбираем рендер по типу
        if (autoOutput.type === 'chart' && toolsHandlers['draw_chart']) {
            console.log(`[ Plan ] Авто-график: ${autoOutput.values?.length} точек`);
            const chartResult = await toolsHandlers['draw_chart']({
                title: autoOutput.title,
                labels: autoOutput.labels,
                values: autoOutput.values
            });
            try { return chartResult; } catch { return JSON.stringify(lastResult); }
        }
        
        if (autoOutput.type === 'table' && toolsHandlers['render_table']) {
            console.log(`[ Plan ] Авто-таблица: ${autoOutput.data?.length} строк`);
            const tableResult = await toolsHandlers['render_table']({
                title: autoOutput.title,
                data: autoOutput.data
            });
            try { return tableResult; } catch { return JSON.stringify(lastResult); }
        }
    }
    
    return JSON.stringify(lastResult);
}

// Авто-определение типа данных и выбор рендерера
function autoDetectAndRender(result) {
    if (!result) return null;
    
    // Если уже есть image - это уже готовый вывод
    if (result.image && result.image.startsWith('data:')) {
        return { type: 'image', data: result };
    }
    
    // Если это история (массив с date/price или類似) → график
    if (result.history && Array.isArray(result.history) && result.history.length > 0) {
        const first = result.history[0];
        const hasDate = 'date' in first;
        const hasValue = 'price' in first || 'close' in first || 'value' in first;
        
        if (hasDate && hasValue) {
            return {
                type: 'chart',
                title: result.symbol || 'График',
                labels: result.history.map(d => d.date),
                values: result.history.map(d => Number(d.price || d.close || d.value) || 0)
            };
        }
        
        // Иначе → таблица
        return {
            type: 'table',
            title: result.symbol || 'Таблица',
            data: result.history
        };
    }
    
    // Если обычный массив объектов → таблица
    if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
        return {
            type: 'table',
            title: 'Таблица',
            data: result
        };
    }
    
    return null;
}

function substitutePlaceholders(obj, results) {
    // Особый случай для draw_chart - автоматическая обработка данных
    if (obj.title && obj.source !== undefined && obj.key_labels && obj.key_values) {
        const sourceResult = results[obj.source]?.result;
        console.log(`[ Plan ] sourceResult:`, Object.keys(sourceResult));
        if (sourceResult && sourceResult.history) {
            const history = sourceResult.history;
            console.log(`[ Plan ] history[0]:`, history[0]);
            console.log(`[ Plan ] key_labels: ${obj.key_labels}, key_values: ${obj.key_values}`);
            return {
                title: obj.title,
                labels: history.map(d => d[obj.key_labels]),
                values: history.map(d => d[obj.key_values])
            };
        }
    }
    
    // Особый случай для render_table - передать данные напрямую
    if (obj.tool === "render_table" && obj.source !== undefined) {
        const sourceResult = results[obj.source]?.result;
        if (sourceResult && sourceResult.history) {
            console.log(`[ Plan ] render_table: history length =`, sourceResult.history.length);
            return {
                title: obj.title || "Данные",
                data: sourceResult.history
            };
        }
    }
    
    if (typeof obj === "string") {
        let result = obj;
        const regex = /\{\{steps\.(\d+)\.result\.(\w+)\}\}/g;
        let match;
        let replaced = false;
        while ((match = regex.exec(obj)) !== null) {
            const stepId = parseInt(match[1]);
            const field = match[2];
            let value = results[stepId]?.result[field];
            
            if (typeof value === "string") {
                try { value = JSON.parse(value); } catch {}
            }
            
            if (value !== undefined) {
                result = result.replace(match[0], JSON.stringify(value));
                replaced = true;
            }
        }
        
        if (!replaced && obj.startsWith('{')) {
            try { return JSON.parse(obj); } catch {}
        }
        
        return result;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => substitutePlaceholders(item, results));
    }
    
    if (typeof obj === "object" && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = substitutePlaceholders(value, results);
        }
        return result;
    }
    
    return obj;
}