export function processResult(result, toolName) {
    if (!result) return null;
    
    try {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        
        // Изображение
        if (parsed.image && parsed.image.startsWith('data:image/png;base64,')) {
            return {
                type: 'image',
                title: parsed.title || toolName,
                data: parsed.image
            };
        }
        
        // Массив изображений
        if (parsed.images && Array.isArray(parsed.images)) {
            return parsed.images.map(img => ({
                type: 'image',
                title: img.title || toolName,
                data: img.image
            }));
        }
        
        // Текст
        if (parsed.text) {
            return {
                type: 'text',
                content: parsed.text
            };
        }
        
        // Если просто строка
        if (typeof result === 'string' && result.trim()) {
            return {
                type: 'text',
                content: result
            };
        }
        
        return null;
    } catch (e) {
        // Не JSON - возвращаем как текст
        if (typeof result === 'string' && result.trim()) {
            return { type: 'text', content: result };
        }
        return null;
    }
}

export function buildResponse(results) {
    const responses = [];
    
    for (const { result, toolName } of results) {
        const processed = processResult(result, toolName);
        if (!processed) continue;
        
        if (Array.isArray(processed)) {
            responses.push(...processed);
        } else {
            responses.push(processed);
        }
    }
    
    return responses;
}