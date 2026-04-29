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
        
        // Обработка source - подстановка данных из предыдущего шага
        let processedArgs = args ? { ...args } : {};
        
        if (processedArgs.source !== undefined) {
            const sourceIdx = processedArgs.source;
            
            // source может быть массивом [0, 1, 2] для нескольких источников
            if (Array.isArray(sourceIdx)) {
                console.log('[Executor] source массив:', sourceIdx);
                
                const allLabels = [];
                const allValues = [];
                const legend = [];
                const symbols = [];
                let usdToRub = null;
                
                // Первый проход - собрать данные и найти курс
                for (const idx of sourceIdx) {
                    const srcResult = stepResults[idx];
                    if (!srcResult) {
                        console.log('[Executor] source ' + idx + ' не найден');
                        continue;
                    }
                    
                    try {
                        const parsed = typeof srcResult === 'string' ? JSON.parse(srcResult) : srcResult;
                        
                        // date_period -> labels
                        if (parsed?.labels && allLabels.length === 0) {
                            allLabels.push(...parsed.labels);
                            console.log('[Executor] labels из шага ' + idx + ': ' + allLabels.length);
                        }
                        
                        // get_finance_data -> values
                        if (parsed?.history) {
                            const vals = parsed.history.map(d => d.price || d.close).filter(v => v != null);
                            allValues.push(vals);
                            legend.push(parsed.symbol || 'Series ' + allValues.length);
                            symbols.push(parsed.symbol);
                            console.log('[Executor] values из шага ' + idx + ': ' + vals.length + ', symbol: ' + parsed.symbol);
                        }
                        
                        // Курс валют (RUB=X)
                        if (parsed?.price && (parsed.symbol === 'RUB=X' || parsed.symbol === 'USD/RUB')) {
                            usdToRub = parseFloat(parsed.price);
                            console.log('[Executor] Курс USD/RUB: ' + usdToRub);
                        }
                    } catch (e) {
                        console.error('[Executor] Ошибка парсинга source ' + idx + ': ' + e.message);
                    }
                }
                
                // Второй проход - конвертировать в рубли если нужно
                let hasUsdAsset = false;
                const convertedValues = allValues.map((vals, i) => {
                    const sym = symbols[i];
                    const isUsdAsset = sym && (sym.includes('-USD') || sym.includes('=F'));
                    if (isUsdAsset) hasUsdAsset = true;
                    if (isUsdAsset && usdToRub) {
                        console.log('[Executor] Конвертирую ' + sym + ' в рубли: *' + usdToRub);
                        return vals.map(v => (parseFloat(v) * usdToRub).toFixed(0));
                    }
                    return vals;
                });
                
                // Обрезать labels до min длины values
                if (allLabels.length > 0 && convertedValues.length > 0) {
                    const minLen = Math.min(allLabels.length, ...convertedValues.map(v => v.length));
                    const trimmedLabels = allLabels.slice(0, minLen);
                    
                    // Обрезать каждый массив values до minLen
                    const trimmedValues = convertedValues.map(v => v.slice(0, minLen));
                    
                    processedArgs.labels = trimmedLabels;
                    processedArgs.values = trimmedValues;
                    processedArgs.legend = legend;
                    if (hasUsdAsset && usdToRub) {
                        processedArgs.currency = 'RUB';
                    }
                    delete processedArgs.source;
                    console.log('[Executor] Объединено: labels=' + trimmedLabels.length + ', values=' + trimmedValues.length + ', legend=' + legend.join(', ') + (processedArgs.currency ? ', currency=' + processedArgs.currency : ''));
                }
            } else {
                // Одиночный source (число) - старая логика
                const sourceResult = stepResults[sourceIdx];
            
            if (sourceResult) {
                console.log(`[Executor] Подставляю данные из шага ${sourceIdx}`);
                
                try {
                    const parsed = typeof sourceResult === 'string' ? JSON.parse(sourceResult) : sourceResult;
                    
                    // Для draw_chart - извлечь данные
                    if (tool === 'draw_chart' && processedArgs.key_labels && processedArgs.key_values) {
                        if (parsed?.history) {
                            processedArgs.labels = parsed.history.map(d => d[processedArgs.key_labels]);
                            processedArgs.values = parsed.history.map(d => d[processedArgs.key_values]);
                            delete processedArgs.source;
                            console.log(`[Executor] draw_chart: ${processedArgs.labels?.length} точек`);
                        }
                    }
                    
                    // Для render_table - передать данные
                    if (tool === 'render_table') {
                        if (parsed?.history) {
                            processedArgs.data = parsed.history;
                            delete processedArgs.source;
                            console.log(`[Executor] render_table: ${parsed.history.length} строк`);
                        } else if (Array.isArray(parsed)) {
                            processedArgs.data = parsed;
                            delete processedArgs.source;
                            console.log(`[Executor] render_table: ${parsed.length} строк (массив)`);
                        }
                    }
                    
                    // Для date_period -> get_finance_data: передать startDate/endDate
                    if (tool === 'get_finance_data' && parsed?.startDate && parsed?.endDate) {
                        processedArgs.startDate = parsed.startDate;
                        processedArgs.endDate = parsed.endDate;
                        console.log(`[Executor] get_finance_data: ${parsed.startDate} -> ${parsed.endDate}`);
                    }
                    
                    // Для date_period -> draw_chart: передать labels
                    if (tool === 'draw_chart' && parsed?.labels) {
                        processedArgs.labels = parsed.labels;
                        console.log(`[Executor] draw_chart: labels from date_period (${parsed.labels.length})`);
                        
                        // Получить values из предыдущего шага
                        if (i > 0) {
                            const prevResult = stepResults[i - 1];
                            if (prevResult) {
                                try {
                                    const prevParsed = typeof prevResult === 'string' ? JSON.parse(prevResult) : prevResult;
                                    if (prevParsed?.history) {
                                        const vals = prevParsed.history.map(d => d.price || d.close);
                                        // Фильтруем null значения
                                        const validVals = vals.filter(v => v != null);
                                        if (validVals.length > 0) {
                                            processedArgs.values = validVals;
                                            // Обрезать labels до количества values
                                            if (processedArgs.labels.length > validVals.length) {
                                                processedArgs.labels = processedArgs.labels.slice(0, validVals.length);
                                                console.log(`[Executor] draw_chart: labels обрезаны до ${validVals.length}`);
                                            }
                                            console.log(`[Executor] draw_chart: values from step ${i-1} (${processedArgs.values.length})`);
                                        } else {
                                            console.log(`[Executor] draw_chart: нет валидных values в history`);
                                        }
                                    }
                                } catch (e) {
                                    console.error(`[Executor] Ошибка получения values: ${e.message}`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[Executor] Ошибка парсинга source: ${e.message}`);
                }
            } else {
                console.log(`[Executor] source ${sourceIdx} не найден`);
            }
            } // закрытие else для массива source
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