import { log } from '../logger.mjs';

export const definition = {
    name: "weather_api",
    description: "Получить текущие погодные условия по координатам (lat/lon). Требуется указать точные координаты.",
    requiredInputs: ["lat", "lon"],
    optionalInputs: ["apiKey"],
    outputs: { text: "string" },
    canExtractFrom: [],
    type: "function",
    function: {
        name: "weather_api",
        description: "Get current weather conditions and forecasts by latitude/longitude coordinates via OpenWeatherMap API.",
        parameters: {
            type: "object",
            properties: {
                lat: { type: "number", description: "Latitude (degrees, -90 to 90)" },
                lon: { type: "number", description: "Longitude (degrees, -180 to 180)" }
            },
            required: ["lat", "lon"]
        }
    }
};

export async function handler(args, toolsHandlers = null) {
    let apiKey = process.env.OPENWEATHERMAP_API_KEY;
    
    if (!apiKey && global.__envCache__?.OPENWEATHERMAP_API_KEY) {
        log('WARN', 'weather_api', 'env_fallback', 'Using OPENWEATHERMAP_API_KEY from cache');
        apiKey = global.__envCache__.OPENWEATHERMAP_API_KEY;
    } else if (!apiKey) {
        log('ERROR', 'weather_api', 'config_error', 'OPENWEATHERMAP_API_KEY не указан в .env');
        return JSON.stringify({ error: "OPENWEATHERMAP_API_KEY не указан" });
    }
    
    const { lat, lon } = args;

    // Проверка обязательных параметров
    if (lat === undefined || lon === undefined) {
        log('WARN', 'weather_api', 'missing_coords', `Отсутствуют координаты: ${JSON.stringify(args)}`);
        
        return JSON.stringify({
            intermediate: true,
            missingInputs: ["lat", "lon"],
            suggestedTools: ["fact_lookup"]
        });
    }

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
    } else {
        // Should not reach here due to earlier check, but fallback for safety
        return JSON.stringify({ 
            error: "Требуется параметр 'lat' и 'lon'", 
            intermediate: true,
            suggestedTools: ["fact_lookup"]
        });
    }
}
