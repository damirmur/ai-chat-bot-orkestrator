import { log } from '../logger.mjs';

export const definition = {
    name: "fact_lookup",
    description: "Искать факты о городах и извлекать структурированные данные (координаты, цены, факты). Используется для поиска координат городов.",
    requiredInputs: [],  // Оба параметра опциональны — передаётся один из них
    optionalInputs: ["query", "city"],
    outputs: { 
        lat: "number|null",
        lon: "number|null",
        text: "string"
    },
    canExtractFrom: []
};

export async function handler(args, toolsHandlers = null) {
    try {
        // Поддержка обоих параметров: query и city (синонимы)
        const { query, city } = args;
        const cityName = query || city;
        
        if (!cityName || typeof cityName !== 'string') {
            log('ERROR', 'fact_lookup', 'invalid_query', 'Отсутствует или некорректный запрос (требуется query или city)');
            return JSON.stringify({ error: "Требуется параметр 'query' или 'city'" });
        }
        
        // Поиск фактов через модель (используем model_tool с fact_extractor)
        if (!toolsHandlers || !toolsHandlers['model_tool']) {
            log('WARN', 'fact_lookup', 'no_model_tool', 'model_tool не доступен');
            return JSON.stringify({ 
                error: "model_tool недоступен, попробуйте указать координаты напрямую" 
            });
        }
        
        // Промпт для извлечения фактов о городе
        const prompt = `Ты - база знаний. Задача: найти факты по запросу "${cityName}".

Если знаешь координаты города — верни JSON с lat/lon:
{
    "lat": число,  /* широта от -90 до 90 */
    "lon": число,  /* долгота от -180 до 180 */
    "text": "краткое описание города"
}

Если не знаешь координаты — верни {"error": "data not found"}

Верни ТОЛЬКО JSON без текста и объяснений.`;
        
        const result = await toolsHandlers['model_tool']({ 
            action: 'fact_extractor',
            text: prompt,
            targetField: 'coordinates'
        }, toolsHandlers);
        
        let parsed;
        try {
            parsed = JSON.parse(result || '{}');
        } catch (e) {
            log('WARN', 'fact_lookup', 'parse_error', `Ошибка парсинга ответа модели: ${e.message}`);
            return JSON.stringify({ error: "Не удалось обработать ответ" });
        }
        
        // Проверка результата
        if (parsed.error || parsed.lat === undefined || parsed.lon === undefined) {
            log('INFO', 'fact_lookup', 'no_coords_found', `Факты не найдены для "${cityName}"`);
            return JSON.stringify({ 
                error: `Не удалось найти координаты для "${cityName}". Попробуйте использовать web_search для поиска информации о городе.`
            });
        }
        
        const lat = parseFloat(parsed.lat);
        const lon = parseFloat(parsed.lon);
        
        // Валидация диапазонов
        if (lat < -90 || lat > 90) {
            log('WARN', 'fact_lookup', 'invalid_lat', `Некорректная широта: ${lat}`);
            return JSON.stringify({ error: "Некорректные координаты" });
        }
        
        if (lon < -180 || lon > 180) {
            log('WARN', 'fact_lookup', 'invalid_lon', `Некорректная долгота: ${lon}`);
            return JSON.stringify({ error: "Некорректные координаты" });
        }
        
        const text = parsed.text || `Город с координатами (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
        
        log('INFO', 'fact_lookup', 'success', `Нашли факты для "${cityName}": Lat ${lat}, Lon ${lon}`);
        
        return JSON.stringify({ 
            lat: lat,
            lon: lon,
            text: text
        });
        
    } catch (error) {
        log('ERROR', 'fact_lookup', 'handler_error', error.message);
        throw error;
    }
}
