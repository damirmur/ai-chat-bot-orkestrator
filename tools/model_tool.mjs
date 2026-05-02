import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "model_tool",
        description: "Use AI model for text processing tasks including translation, summarization, analysis, formatting, data extraction using fact_extractor action, and reference data queries using fact_lookup action.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["translate", "summarize", "analyze", "format", "extract", "fact_lookup", "compare", "explain", "rewrite"],
                    description: "Action to perform: translate=text translation, summarize=create summary, analyze=text analysis, format=structure text, extract=extract key data/facts, fact_lookup=query reference data, compare=simple comparison, explain=simplify explanation, rewrite=rephrase"
                },
                text: { type: "string", description: "Input text to process or query about" },
                target_lang: { type: "string", description: "Target language for translation (e.g., en, ru)" },
                targetField: { type: "string", description: "Data field type for fact_extractor action (e.g., coordinates, prices)" }
            },
            required: ["action", "text"]
        }
    }
};

export async function handler(args, toolsHandlers) {
    // Try to get askLM from toolsHandlers first (when called via executor)
    let askLM = null;
    
    if (toolsHandlers && typeof toolsHandlers.askLM === 'function') {
        askLM = toolsHandlers.askLM;
    }
    else if (global.askLM && typeof global.askLM === 'function') {
        askLM = global.askLM;
    }
    
    const { action, text, target_lang, targetField } = args;
    
    if (!text) {
        log('WARN', 'model_tool', 'no_text', 'Текст не передан');
        return JSON.stringify({ error: "Текст не передан" });
    }
    
    let prompt;
    
    switch (action) {
        case 'translate':
            prompt = `Переведи текст на ${target_lang || 'русский язык'}:\n\n${text}`;
            break;
        case 'summarize':
            prompt = `Сделай краткое резюме текста:\n\n${text}`;
            break;
        case 'analyze':
            prompt = `Проанализируй текст (тональность, ключевые мысли):\n\n${text}`;
            break;
        case 'format':
            prompt = `Отформатируй текст (структурируй, сделай читаемым):\n\n${text}`;
            break;
        case 'extract':
            prompt = `Извлеки из текста ключевые данные (имена, даты, числа, факты):\n\n${text}`;
            break;
        case 'compare':
            prompt = `Сравни два текста или фрагмента:\n\n${text}`;
            break;
        case 'explain':
            prompt = `Объясни или упрости текст:\n\n${text}`;
            break;
        case 'rewrite':
            prompt = `Перефразируй текст, сохранив смысл:\n\n${text}`;
            break;
        case 'fact_lookup':
            const isCoordsQuery = text.toLowerCase().includes('координаты');
            prompt = `Ты - справочная база знаний. Если точно знаешь ответ, верни ТОЛЬКО чистый JSON без дополнительных текста и объяснений. Если данные неизвестны или неточно — верни {"error": "data not found"}.

Вопрос: ${text}

${isCoordsQuery ? 'Пример для координат: {"lat": 38.9072, "lon": -77.0369}' : ''}`;
            
            break;
        case 'fact_extractor':
            prompt = `Ты - инструмент извлечения данных. Твоя задача: принять сырой текст и вернуть данные в указанном формате JSON.

Входной текст: ${text}
Тип данных для извлечения: ${targetField || 'coordinates'}

Инструкция: 
1. Проанализируй входной текст на наличие нужных данных
2. Если найденные данные соответствуют запрошенному формату, верни их в JSON
3. Если данные не найдены или неточно — верни {"error": "data not found"}
4. При необходимости можешь написать и выполнить скрипт для обработки данных

Для координат возвращай: {"lat": число, "lon": число}
Для цен возвращай: {"price_usd": "число", "currency": "валюта"}
Для других форматов - используй логику из prompt.

Верни ТОЛЬКО JSON, без текста и объяснений.`;
            
            break;
        default:
            return JSON.stringify({ error: `Неизвестное действие: ${action}` });
    }
    
    try {
        const result = await askLM([
            { role: 'user', content: prompt }
        ], false);
        
        if (action === 'fact_lookup') {
            try {
                const jsonResult = JSON.parse(result.content || '{}');
                log('INFO', 'model_tool', 'fact_found', `Нашли факты: ${JSON.stringify(jsonResult)}`);
                return JSON.stringify(jsonResult);
            } catch (e) {
                log('WARN', 'model_tool', 'parse_error', `Ошибка парсинга JSON: ${e.message}`);
                return JSON.stringify({ error: `Не удалось извлечь данные. Модель вернула текст вместо JSON.` });
            }
        }
        
        return JSON.stringify({ text: result.content });
        
    } catch (e) {
        log('ERROR', 'model_tool', 'error', `Ошибка: ${e.message}`);
        return JSON.stringify({ error: e.message });
    }
}
