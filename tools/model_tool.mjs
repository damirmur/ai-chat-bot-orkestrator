export const definition = {
    type: "function",
    function: {
        name: "model_tool",
        description: "Использовать модель для задач: перевод, анализ, форматирование, резюмирование текста. Используй когда нет других инструментов.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["translate", "summarize", "analyze", "format", "extract", "compare", "explain", "rewrite"],
                    description: "Действие: translate - перевод, summarize - сокращение, analyze - анализ, format - форматирование, extract - извлечение данных, compare - сравнение, explain - объяснение, rewrite - перефразирование"
                },
                text: { type: "string", description: "Текст для обработки" },
                target_lang: { type: "string", description: "Целевой язык для перевода (ru, en, и т.д.)" }
            },
            required: ["action", "text"]
        }
    }
};

export async function handler(args, toolsHandlers) {
    const askLM = toolsHandlers.askLM;
    const { action, text, target_lang } = args;
    
    console.log(`[model_tool] action: ${action}, text length: ${text?.length || 0}`);
    
    if (!text) {
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
        default:
            return JSON.stringify({ error: `Неизвестное действие: ${action}` });
    }
    
    try {
        // Вызов модели напрямую через history (без tool_choice)
        const result = await askLM([
            { role: 'user', content: prompt }
        ], false);
        
        console.log(`[model_tool] Результат: ${result.content?.substring(0, 100)}...`);
        
        return JSON.stringify({ text: result.content });
        
    } catch (e) {
        console.error(`[model_tool] Ошибка: ${e.message}`);
        return JSON.stringify({ error: e.message });
    }
}