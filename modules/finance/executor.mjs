/**
 * Модуль для обработки финансовых шагов
 * Содержит логику конвертации валют, мульти-series графиков
 */

export function processFinanceStep(step, stepResults) {
    const { tool, args } = step;
    let processedArgs = args ? { ...args } : {};
    
    if (processedArgs.source !== undefined) {
        const sourceIdx = processedArgs.source;
        
        // source может быть массивом [0, 1, 2] для нескольких источников
        if (Array.isArray(sourceIdx)) {
            console.log('[Finance] source массив:', sourceIdx);
            
            const allLabels = [];
            const allValues = [];
            const legend = [];
            const symbols = [];
            let usdToRub = null;
            
            // Первый проход - собрать данные и найти курс
            for (const idx of sourceIdx) {
                const srcResult = stepResults[idx];
                if (!srcResult) {
                    console.log('[Finance] source ' + idx + ' не найден');
                    continue;
                }
                
                try {
                    const parsed = typeof srcResult === 'string' ? JSON.parse(srcResult) : srcResult;
                    
                    // date_period -> labels
                    if (parsed?.labels && allLabels.length === 0) {
                        allLabels.push(...parsed.labels);
                        console.log('[Finance] labels из шага ' + idx + ': ' + allLabels.length);
                    }
                    
                    // get_finance_data -> values
                    if (parsed?.history) {
                        let vals = parsed.history.map(d => d.price || d.close).filter(v => v != null);
                        
                        // Если есть курс RUB и актив в USD (по символу) - конвертировать в рубли
                        const isUsdAsset = parsed.symbol && (parsed.symbol.includes('-USD') || parsed.symbol.includes('=F'));
                        if (isUsdAsset && usdToRub) {
                            console.log('[Finance] Конвертирую ' + parsed.symbol + ' в рубли: *' + usdToRub);
                            vals = vals.map(v => (parseFloat(v) * usdToRub).toFixed(0));
                        }
                        
                        allValues.push(vals);
                        legend.push(parsed.symbol || 'Series ' + allValues.length);
                        symbols.push(parsed.symbol);
                        console.log('[Finance] values из шага ' + idx + ': ' + vals.length + ', symbol: ' + parsed.symbol + (isUsdAsset && usdToRub ? ' (RUB)' : ''));
                    }
                    
                    // Курс валют (RUB=X)
                    if (parsed?.price && (parsed.symbol === 'RUB=X' || parsed.symbol === 'USD/RUB')) {
                        usdToRub = parseFloat(parsed.price);
                        console.log('[Finance] Курс USD/RUB: ' + usdToRub);
                    }
                } catch (e) {
                    console.error('[Finance] Ошибка парсинга source ' + idx + ': ' + e.message);
                }
            }
            
            // Второй проход - конвертировать в рубли если нужно
            let hasUsdAsset = false;
            const convertedValues = allValues.map((vals, i) => {
                const sym = symbols[i];
                const isUsdAsset = sym && (sym.includes('-USD') || sym.includes('=F'));
                if (isUsdAsset) hasUsdAsset = true;
                if (isUsdAsset && usdToRub) {
                    console.log('[Finance] Конвертирую ' + sym + ' в рубли: *' + usdToRub);
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
                
                // Если есть хоть один USD актив и курс RUB - ставим RUB
                if (hasUsdAsset && usdToRub) {
                    processedArgs.currency = 'RUB';
                }
                
                delete processedArgs.source;
                console.log('[Finance] Объединено: labels=' + trimmedLabels.length + ', values=' + trimmedValues.length + ', legend=' + legend.join(', ') + (processedArgs.currency ? ', currency=' + processedArgs.currency : ''));
                
                return processedArgs;
            }
        } else {
            // Одиночный source (число) - старая логика
            const sourceIdxNum = parseInt(sourceIdx);
            const sourceResult = stepResults[sourceIdxNum];
            
            if (sourceResult) {
                console.log('[Finance] Подставляю данные из шага ' + sourceIdxNum);
                
                try {
                    const parsed = typeof sourceResult === 'string' ? JSON.parse(sourceResult) : sourceResult;
                    
                    // Для draw_chart - извлечь данные
                    if (tool === 'draw_chart' && processedArgs.key_labels && processedArgs.key_values) {
                        if (parsed?.history) {
                            processedArgs.labels = parsed.history.map(d => d[processedArgs.key_labels]);
                            processedArgs.values = parsed.history.map(d => d[processedArgs.key_values]);
                            delete processedArgs.source;
                            console.log('[Finance] draw_chart: ' + processedArgs.labels?.length + ' точек');
                        }
                    }
                    
                    // Для render_table - передать данные
                    if (tool === 'render_table') {
                        if (parsed?.history) {
                            processedArgs.data = parsed.history;
                            delete processedArgs.source;
                            console.log('[Finance] render_table: ' + parsed.history.length + ' строк');
                        } else if (Array.isArray(parsed)) {
                            processedArgs.data = parsed;
                            delete processedArgs.source;
                            console.log('[Finance] render_table: ' + parsed.length + ' строк (массив)');
                        }
                    }
                    
                    // Для date_period -> get_finance_data: передать startDate/endDate
                    if (tool === 'get_finance_data' && parsed?.startDate && parsed?.endDate) {
                        processedArgs.startDate = parsed.startDate;
                        processedArgs.endDate = parsed.endDate;
                        console.log('[Finance] get_finance_data: ' + parsed.startDate + ' -> ' + parsed.endDate);
                    }
                    
                    // Для date_period -> draw_chart: передать labels
                    if (tool === 'draw_chart' && parsed?.labels) {
                        processedArgs.labels = parsed.labels;
                        console.log('[Finance] draw_chart: labels from date_period (' + parsed.labels.length + ')');
                        
                        // Получить values из предыдущего шага
                        if (sourceIdxNum > 0) {
                            const prevResult = stepResults[sourceIdxNum - 1];
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
                                                console.log('[Finance] draw_chart: labels обрезаны до ' + validVals.length);
                                            }
                                            console.log('[Finance] draw_chart: values from step ' + (sourceIdxNum - 1) + ' (' + processedArgs.values.length + ')');
                                        } else {
                                            console.log('[Finance] draw_chart: нет валидных values в history');
                                        }
                                    }
                                } catch (e) {
                                    console.error('[Finance] Ошибка получения values: ' + e.message);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[Finance] Ошибка парсинга source: ' + e.message);
                }
            } else {
                console.log('[Finance] source ' + sourceIdxNum + ' не найден');
            }
            
            return processedArgs;
        }
    }
    
    return processedArgs;
}
