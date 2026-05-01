import { log } from '../logger.mjs';
import { executePlan } from './executor.mjs';
import { buildResponse } from './response.mjs';

const MAX_RETRIES = 5;

function parseJsonPlan(response) {
    if (!response) return null;
    
    let s = response.trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/g, '').trim();
    
    try {
        const parsed = JSON.parse(s);
        if (parsed.steps && Array.isArray(parsed.steps)) {
            // Normalize steps: accept both "tool" and "action" as the tool name
            const steps = parsed.steps.map(st => ({
                tool: st.tool || st.action,
                args: st.args || {}
            }));
            log('INFO', 'handler', 'plan_found', `JSON‑план: ${steps.length} шагов`);
            return { steps };
        }
    } catch (e) {}
    
    return null;
}

function processResults(resultsArray, history) {
    const errors = [];
    for (const item of resultsArray) {
        try {
            const parsed = JSON.parse(item.result);
            if (parsed.error) {
                errors.push({ tool: item.toolName, error: parsed.error });
                log('ERROR', 'handler', 'tool_error', `${item.toolName}: ${parsed.error}`);
            }
        } catch {}
    }
    
    if (errors.length > 0) {
        return { type: 'error', errors };
    }
    
    const images = buildResponse(resultsArray).filter(r => r.type === 'image');
    if (images.length > 0) {
        return { type: 'image', data: images };
    }
    
    let lastTextResult = null;
    for (const item of resultsArray) {
        try {
            const parsed = JSON.parse(item.result);
            if (parsed.intermediate) {
                log('INFO', 'handler', 'skip_intermediate', item.toolName);
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

export async function handleRequest(query, toolsHandlers, askLM, systemPrompt, peerId, conversationHistory = []) {
    log('INFO', 'handler', 'request_received', query);
    
    let currentQuery = query;
    let attempts = 0;
    
    while (attempts < MAX_RETRIES) {
        attempts++;
        log('INFO', 'handler', 'attempt', `Попытка ${attempts}/${MAX_RETRIES}`);
        
        // Включаем историю разговора в сообщения
        const history = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'system', content: `Текущий peerId отправителя: ${peerId}` },
            { role: 'user', content: currentQuery }
        ];
        
        const response = await askLM(history);
        let responseText = response.content || '';
        
        log('INFO', 'handler', 'model_response', `Ответ модели (${responseText.length} символов): ${responseText.substring(0, 300)}`);
        
        if (!responseText && response.tool_calls && response.tool_calls.length > 0) {
            log('INFO', 'handler', 'fallback', `использую tool_calls (${response.tool_calls.length} шт)`);
            
            const planFromCalls = {
                steps: response.tool_calls.map(tc => ({
                    tool: tc.function.name,
                    args: JSON.parse(tc.function.arguments)
                }))
            };
            
            log('INFO', 'handler', 'plan_from_tool_calls', planFromCalls.steps.map(s => s.tool).join(', '));
            
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
                log('INFO', 'handler', 'done', 'Запрос успешно выполнен (image)');
                return processed.data;
            }
            log('INFO', 'handler', 'done', 'Запрос успешно выполнен (fallback)');
            return [{ type: 'text', content: processed.content + '\n\nЗапрос успешно завершён.' }];
        }
        
        const plan = parseJsonPlan(responseText);
        
        log('INFO', 'handler', 'plan_received', JSON.stringify(plan));
        
        if (!plan) {
            if (attempts === MAX_RETRIES) {
                if (responseText.trim()) {
                    return [{ type: 'text', content: responseText }];
                }
                return [{ type: 'text', content: 'Не удалось получить ответ от модели.' }];
            }
            currentQuery = `Ошибка: пустой ответ. Повторите для "${query}", но обязательно верните JSON-план {"steps": [...]}, а не текст.`;
            continue;
        }
        
        log('INFO', 'handler', 'executing_plan', plan.steps.map(s => s.tool).join(' → '));
        const results = await executePlan(plan.steps, toolsHandlers);
        
        const processed = processResults(results, history);
        
        if (processed.type === 'error') {
            if (attempts < MAX_RETRIES) {
                const errDetails = processed.errors.map(e => `${e.tool}: ${e.error}`).join('; ');
                currentQuery = `Ошибка: ${errDetails}. Составь новый план.`;
                log('INFO', 'handler', 'replan', currentQuery);
                continue;
            }
            return [{ type: 'text', content: `Не удалось выполнить. Причины: ${processed.errors.map(e => e.error).join('; ')}` }];
        }
        
        if (processed.type === 'image') {
            log('INFO', 'handler', 'done', 'Запрос успешно выполнен (image)');
            return [...processed.data, { type: 'text', content: 'Запрос успешно завершён.' }];
        }
        log('INFO', 'handler', 'done', 'Запрос успешно выполнен');
        return [
            { type: 'text', content: processed.content },
            { type: 'text', content: 'Запрос успешно завершён.' }
        ];
    }
    
    return [];
}
