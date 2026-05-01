import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "weather_api",
        description: "Получает погодные данные по координатам через OpenWeatherMap API.",
        parameters: {
            type: "object",
            properties: {
                lat: { type: "number", description: "Широта" },
                lon: { type: "number", description: "Долгота" }
            },
            required: ["lat", "lon"]
        }
    }
};

export async function handler(args, toolsHandlers = null) {
    let apiKey = args.apiKey;
    
    if (!apiKey && global.__envCache__?.OPENWEATHERMAP_API_KEY) {
        console.log('[ENV FALLBACK] Using OPENWEATHERMAP_API_KEY from global cache');
        apiKey = global.__envCache__.OPENWEATHERMAP_API_KEY;
    } else if (!apiKey) {
        apiKey = process.env.OPENWEATHERMAP_API_KEY;
        
        if (apiKey !== undefined && apiKey !== '') {
            console.log('[ENV FALLBACK] Using OPENWEATHERMAP_API_KEY from environment');
            if (!global.__envCache__) global.__envCache__ = {};
            global.__envCache__.OPENWEATHERMAP_API_KEY = apiKey;
        } else {
            log('ERROR', 'weather_api', 'config_error', 'OPENWEATHERMAP_API_KEY не указан в .env');
            return JSON.stringify({ error: "OPENWEATHERMAP_API_KEY не указан" });
        }
    }
    
    const { lat, lon, query } = args;

    if (lat !== undefined && lon !== undefined) {
        log('INFO', 'weather_api', 'use_coords_direct', `Запрос по координатам: Lat ${lat}, Lon ${lon}`);
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&lang=ru`;
            
            const response = await fetch(url); 
            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }
            const data = await response.json();
            
            const tempC = Math.round(data.main.temp - 273.15);
            const weatherDesc = data.weather[0]?.description || 'неизвестно';
            const windSpeed = (data.wind.speed * 3.6).toFixed(1);
            
            return JSON.stringify({ 
                text: `Погода в ${data.name} (${lat.toFixed(2)}, ${lon.toFixed(2)}):\n` +
                     `Температура: ${tempC}°C\n` +
                     `Погода: ${weatherDesc}\n` +
                     `Ветер: ${windSpeed} км/ч\n` +
                     `Давление: ${data.main.pressure} гПа, Влажность: ${data.main.humidity}%\n` +
                     `Ясно: ${data.clouds.all}% облачности`
            });

        } catch (e) {
            log('ERROR', 'weather_api', 'api_call_error', e.message);
            return JSON.stringify({ error: 'Не удалось получить данные погоды с API.' });
        }
    } else if (query) {
        log('INFO', 'weather_api', 'use_query', `Получение координат для города: ${query}`);
        
        // Step 1: Try model_tool(fact_lookup) - asks model if it knows from internal knowledge
        let coords = await getCoordsFromModelTool(query, toolsHandlers);
        
        if (coords) {
            log('INFO', 'weather_api', 'model_tool_found_coords', `Нашли координаты через model_tool: Lat ${coords.lat}, Lon ${coords.lon}`);
        } else {
            // Step 2: If model doesn't know exactly - try web_search + model_tool(fact_extractor)
            log('WARN', 'weather_api', 'fact_lookup_failed', 'Модель не знает точно, пробуем веб-поиск');
            coords = await getCoordsFromWebSearch(query, toolsHandlers);
        }

        if (coords) {
            try {
                const url = `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&lang=ru`;

                const response = await fetch(url); 
                if (!response.ok) {
                    throw new Error(`API error: ${response.statusText}`);
                }
                const data = await response.json();
                
                const tempC = Math.round(data.main.temp - 273.15);
                const weatherDesc = data.weather[0]?.description || 'неизвестно';
                const windSpeed = (data.wind.speed * 3.6).toFixed(1);

                return JSON.stringify({ 
                    text: `Погода в ${data.name} (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}):\n` +
                         `Температура: ${tempC}°C\n` +
                         `Погода: ${weatherDesc}\n` +
                         `Ветер: ${windSpeed} км/ч\n` +
                         `Давление: ${data.main.pressure} гПа, Влажность: ${data.main.humidity}%\n` +
                         `Ясно: ${data.clouds.all}% облачности`
                });

            } catch (e) {
                 log('ERROR', 'weather_api', 'api_call_error', e.message);
                return JSON.stringify({ error: 'Не удалось получить данные погоды с API.' });
            }
        } else {
            // Both methods failed - return helpful error message
            return JSON.stringify({ error: `Не могу найти координаты для "${query}". Попробуйте указать город по-другому или проверьте название.`});
        }

    } else {
        return JSON.stringify({ error: "Требуется либо 'lat'/'lon', либо 'query'.", intermediate: true });
    }
}

/**
 * Gets coordinates using model_tool(fact_lookup) - asks model if it knows from internal knowledge
 */
async function getCoordsFromModelTool(query, toolsHandlers) {
    try {
        if (!toolsHandlers || !toolsHandlers['model_tool']) {
            log('WARN', 'weather_api', 'no_model_tool', 'model_tool not available');
            return null;
        }
        
        const lookupPrompt = `Ты - справочная база знаний. Если точно знаешь координаты города "${query}", верни ТОЛЬКО JSON: {"lat": число, "lon": число}. 
Если не знаешь точно или неточно — верни {"error": "data not found"}`;
        
        const result = await toolsHandlers['model_tool']({ 
            action: 'fact_lookup', 
            text: lookupPrompt
        }, toolsHandlers);  // Pass toolsHandlers for askLM
        
        let parsed;
        try {
            parsed = JSON.parse(result || '{}');
        } catch (e) {
            log('WARN', 'weather_api', 'model_tool_parse_error', `Can't parse model response: ${e.message}`);
            return null;
        }
        
        // Check if model returned error or uncertain data
        if (parsed.error || (typeof parsed.lat === 'string' && parsed.lat.includes('не'))) {
            log('INFO', 'weather_api', 'model_tool_uncertain', `Модель говорит не точно/не знает для ${query}`);
            return null;  // Will fallback to web_search
        }
        
        if (!parsed.error && parsed.lat !== undefined && parsed.lon !== undefined) {
            const lat = parseFloat(parsed.lat);
            const lon = parseFloat(parsed.lon);
            
            // Validate coordinates are within reasonable range
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                log('INFO', 'weather_api', 'model_tool_found_coords', `Модель знает координаты ${query}: Lat ${lat}, Lon ${lon}`);
                return { lat, lon };
            } else {
                log('WARN', 'weather_api', 'model_tool_invalid_range', 'Некорректный диапазон координат');
                return null;
            }
        } else {
            log('INFO', 'weather_api', 'model_tool_no_coords', `Модель вернула некорректные координаты для ${query}`);
            return null;  // Will fallback to web_search
        }
        
    } catch (e) {
        log('WARN', 'weather_api', 'model_tool_error', e.message);
        return null;  // Will fallback to web_search
    }
}

/**
 * Gets coordinates using web_search + model_tool(fact_extractor) - for unknown cities
 */
async function getCoordsFromWebSearch(query, toolsHandlers) {
    try {
        if (!toolsHandlers || !toolsHandlers['web_search'] || !toolsHandlers['model_tool']) {
            log('WARN', 'weather_api', 'no_web_search', 'web_search или model_tool недоступны');
            return null;
        }
        
        // Step 1: Search for coordinates
        const searchQuery = `${query} координаты широта долгота`;
        log('INFO', 'weather_api', 'searching_coords', `Веб-поиск для: ${searchQuery}`);
        
        const searchResult = await toolsHandlers['web_search']({ query: searchQuery });
        let searchText;
        try {
            const parsed = JSON.parse(searchResult || '{}');
            searchText = parsed.text || '';
        } catch (e) {
            log('WARN', 'weather_api', 'search_parse_error', `Не удалось распарсить результат поиска`);
            return null;
        }
        
        if (!searchText) {
            log('ERROR', 'weather_api', 'no_search_results', 'Нет результатов веб-поиска');
            return null;
        }
        
        // Step 2: Extract coordinates using model_tool(fact_extractor)
        const extractPrompt = `Ты - инструмент извлечения данных. Твоя задача: принять сырой текст поиска и вернуть данные в формате JSON.

Входной текст: ${searchText}
Тип данных для извлечения: координаты города (широта lat, долгота lon)

Инструкция: 
1. Проанализируй текст на наличие чисел которые могут быть широтой и долготой
2. Широта обычно от -90 до 90, долгота от -180 до 180
3. Если найдены координаты — верни их в JSON: {"lat": число, "lon": число}
4. Если данные не найдены — верни {"error": "data not found"}

Верни ТОЛЬКО JSON, без текста и объяснений.`;
        
        const extractResult = await toolsHandlers['model_tool']({ 
            action: 'fact_extractor', 
            text: searchText,
            targetField: 'coordinates'
        }, toolsHandlers);  // Pass toolsHandlers for askLM
        
        let parsed;
        try {
            parsed = JSON.parse(extractResult || '{}');
        } catch (e) {
            log('WARN', 'weather_api', 'extractor_parse_error', `Не удалось распарсить модель_tool response`);
            return null;
        }
        
        // Check if extraction succeeded
        if (parsed.error) {
            log('ERROR', 'weather_api', 'fact_extractor_failed', `model_tool(fact_extractor) не смог извлечь координаты для ${query}`);
            return null;  // Return error to user
        }
        
        if (!parsed.lat || !parsed.lon) {
            log('WARN', 'weather_api', 'extractor_no_coords', 'Извлечённые данные отсутствуют lat/lon');
            return null;
        }
        
        const lat = parseFloat(parsed.lat);
        const lon = parseFloat(parsed.lon);
        
        // Validate coordinates are within reasonable range
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            log('INFO', 'weather_api', 'coords_from_web_search', `Извлечены координаты из поиска: Lat ${lat}, Lon ${lon}`);
            return { lat, lon };
        } else {
            log('WARN', 'weather_api', 'invalid_extracted_coords', 'Некорректный диапазон извлечённых координат');
            return null;
        }
        
    } catch (e) {
        log('ERROR', 'weather_api', 'web_search_error', e.message);
        return null;  // Return error to user
    }
}
