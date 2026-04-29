export const definition = {
    type: "function",
    function: {
        name: "agent_single_facts",
        description: "Преобразовать JSON данные в читаемый текстовый ответ.",
        parameters: {
            type: "object",
            properties: {
                data: {
                    type: "object",
                    description: "JSON данные для преобразования"
                }
            },
            required: ["data"]
        }
    }
};

function formatValue(key, value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
        return value.toLocaleString('ru-RU');
    }
    if (typeof value === 'string') {
        return value;
    }
    return '';
}

function extractFacts(data) {
    const facts = [];
    
    if (typeof data !== 'object' || data === null) {
        return String(data);
    }
    
    if (data.symbol) {
        facts.push(`Символ: ${data.symbol}`);
    }
    
    if (data.price !== undefined) {
        facts.push(`Цена: ${formatValue('price', data.price)}`);
    }
    
    if (data.currency) {
        facts.push(`Валюта: ${data.currency}`);
    }
    
    if (data.history && Array.isArray(data.history) && data.history.length > 0) {
        const first = data.history[0];
        const last = data.history[data.history.length - 1];
        if (first.price && last.price) {
            facts.push(`Диапазон: ${formatValue('price', first.price)} - ${formatValue('price', last.price)}`);
        }
    }
    
    for (const [key, value] of Object.entries(data)) {
        if (['symbol', 'price', 'currency', 'history', 'url', 'error'].includes(key)) {
            continue;
        }
        if (typeof value === 'string' && value.length < 100) {
            facts.push(`${key}: ${value}`);
        }
    }
    
    return facts.join('. ');
}

export async function handler(args) {
    // Принимаем и data (JSON от agent_data_request), и fact (уже готовый текст)
    const { data, fact } = args;
    
    console.log(`[agent_single_facts] Получены: data=${!!data}, fact=${!!fact}`);
    
    // Если fact уже передан как текст - возвращаем как есть
    if (fact) {
        console.log(`[agent_single_facts] Факт: ${fact}`);
        return JSON.stringify({ text: String(fact) });
    }
    
    if (!data || typeof data !== 'object') {
        return JSON.stringify({ text: String(data || 'Нет данных') });
    }
    
    if (data.error) {
        return JSON.stringify({ text: `Ошибка: ${data.error}` });
    }
    
    const text = extractFacts(data);
    
    console.log(`[agent_single_facts] Результат: ${text}`);
    
    return JSON.stringify({ text });
}