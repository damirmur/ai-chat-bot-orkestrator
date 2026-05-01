import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "model_tool",
        description: "Использовать модель для обработки текста: перевод, анализ, форматирование, резюме, факты (fact_lookup), извлечение данных (fact_extractor). Для точных фактов использовать fact_lookup action, для обработки сырых данных - fact_extractor action.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["translate", "summarize", "analyze", "format", "extract", "fact_lookup", "compare", "explain", "rewrite"],
                    description: "Действие: translate - перевод, summarize - резюме, analyze - анализ, format - форматирование, extract - извлечение данных, fact_lookup — запрос справочных данных (координаты, столицы), compare - сравнение, explain - объяснение, rewrite - перефразирование"
                },
                text: { type: "string", description: "Текст для обработки" },
                target_lang: { type: "string", description: "Целевой язык для перевода (ru, en, и т.д.)" },
                targetField: { type: "string", description: "Тип данных для извлечения при fact_extractor action" }
            },
            required: ["action", "text"]
        }
    }
};

export async function handler(args, toolsHandlers) {
    const askLM = toolsHandlers.askLM;
    const { action, text, target_lang, targetField } = args;
    
    console.log(`[model_tool] action: ${action}, text length: ${text?.length || 0}`);
    
    if (!text) {
        log('WARN', 'model_tool', 'no_text', 'Текст не передан');
        return JSON.stringify({ error: "Текст не передан" });
    }
    
    console.log(`[model_tool] action: ${action}, text length: ${text?.length || 0}`);
    
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
        
        console.log(`[model_tool] Результат: ${result.content?.substring(0, 100)}...`);
        
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
        console.error(`[model_tool] Ошибка: ${e.message}`);
        return JSON.stringify({ error: e.message });
    }
}
