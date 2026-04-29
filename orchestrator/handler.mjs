import { executePlan } from './executor.mjs';
import { buildResponse } from './response.mjs';

const MAX_RETRIES = 5;

function parseJsonPlan(response) {
    if (!response) return null;
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.steps && Array.isArray(parsed.steps)) {
            console.log(`[Handler] Найден JSON-план: ${parsed.steps.length} шагов`);
            return parsed;
        }
    } catch (e) {}
    
    return null;
}

function processResults(resultsArray, history) {
    // Проверяем на ошибки
    const errors = [];
    for (const item of resultsArray) {
        try {
            const parsed = JSON.parse(item.result);
            if (parsed.error) {
                errors.push({ tool: item.toolName, error: parsed.error });
                console.log(`[Handler] Ошибка: ${item.toolName}: ${parsed.error}`);
            }
        } catch {}
    }
    
    if (errors.length > 0) {
        return { type: 'error', errors };
    }
    
    // Изображения
    const images = buildResponse(resultsArray).filter(r => r.type === 'image');
    if (images.length > 0) {
        return { type: 'image', data: images };
    }
    
    // Любой текстовый результат — возвращаем ПОСЛЕДНИЙ (финальный ответ)
    // Пропускаем промежуточные результаты (intermediate: true)
    let lastTextResult = null;
    for (const item of resultsArray) {
        try {
            const parsed = JSON.parse(item.result);
            // Пропускаем промежуточные результаты
            if (parsed.intermediate) {
                console.log(`[Handler] Пропускаю промежуточный результат: ${item.toolName}`);
                continue;
            }
            if (parsed.text) {
                lastTextResult = parsed.text;
            }
        } catch {
            if (item.result && typeof item.result === 'string' && item.result.length < 1000) {
                lastTextResult = item.result;
            }
        }
    }
    
    if (lastTextResult) {
        return { type: 'text', content: lastTextResult };
    }
    
    return { type: 'text', content: 'Запрос выполнен.' };
}

export async function handleRequest(query, toolsHandlers, askLM, systemPrompt) {
    console.log(`[Handler] Получен запрос: ${query}`);
    
    let currentQuery = query;
    let attempts = 0;
    
    while (attempts < MAX_RETRIES) {
        attempts++;
        console.log(`[Handler] Попытка ${attempts}/${MAX_RETRIES}`);
        
        const history = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: currentQuery }
        ];
        
        const response = await askLM(history);
        let responseText = response.content || '';
        
        console.log(`[Handler] Ответ модели (${responseText.length} символов):`, responseText.substring(0, 300));
        
        // Если content пустой но есть tool_calls - fallback на старый формат
        if (!responseText && response.tool_calls && response.tool_calls.length > 0) {
            console.log(`[Handler] Fallback: использую tool_calls (${response.tool_calls.length} шт)`);
            
            const planFromCalls = {
                steps: response.tool_calls.map(tc => ({
                    tool: tc.function.name,
                    args: JSON.parse(tc.function.arguments)
                }))
            };
            
            console.log(`[Handler] План из tool_calls:`, JSON.stringify(planFromCalls.steps.map(s => s.tool)));
            
            const results = await executePlan(planFromCalls.steps, toolsHandlers);
            const processed = processResults(results, history);
            
            if (processed.type === 'error') {
                if (attempts < MAX_RETRIES) {
                    const errDetails = processed.errors.map(e => `${e.tool}: ${e.error}`).join('; ');
                    currentQuery = `Ошибка: ${errDetails}. Составь новый план без проблемных шагов.`;
                    continue;
                }
                return [{ type: 'text', content: `Не удалось: ${errDetails}` }];
            }
            
            if (processed.type === 'image') {
                console.log('[Handler] Запрос успешно выполнен (fallback image)');
                return processed.data;
            }
            console.log('[Handler] Запрос успешно выполнен (fallback)');
            return [{ type: 'text', content: processed.content + '\n\nЗапрос успешно завершён.' }];
        }
        
        // Пытаемся распарсить JSON-план
        const plan = parseJsonPlan(responseText);
        
        console.log('[Handler] Получен план:', JSON.stringify(plan));
        
        if (!plan) {
            if (responseText.trim()) {
                return [{ type: 'text', content: responseText }];
            }
            return [];
        }
        
        // Выполняем план
        console.log(`[Handler] Выполняю план:`, plan.steps.map(s => s.tool).join(' → '));
        const results = await executePlan(plan.steps, toolsHandlers);
        
        const processed = processResults(results, history);
        
        if (processed.type === 'error') {
            if (attempts < MAX_RETRIES) {
                const errDetails = processed.errors.map(e => `${e.tool}: ${e.error}`).join('; ');
                currentQuery = `Ошибка: ${errDetails}. Составь новый план.`;
                console.log(`[Handler] Перепланирование: ${currentQuery}`);
                continue;
            }
            return [{ type: 'text', content: `Не удалось выполнить. Причины: ${processed.errors.map(e => e.error).join('; ')}` }];
        }
        
        if (processed.type === 'image') {
            console.log('[Handler] Запрос успешно выполнен (image)');
            // Возвращаем изображения и отдельным сообщением "Запрос успешно завершён"
            return [...processed.data, { type: 'text', content: 'Запрос успешно завершён.' }];
        }
        console.log('[Handler] Запрос успешно выполнен');
        // Возвращаем основной ответ и отдельным сообщением "Запрос успешно завершён"
        return [
            { type: 'text', content: processed.content },
            { type: 'text', content: 'Запрос успешно завершён.' }
        ];
    }
    
    return [];
}