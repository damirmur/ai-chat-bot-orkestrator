/** API FORMATTER — Converts extracted data into API-specific formats */
import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "api_formatter",
        description: "Преобразует извлечённые данные в формат конкретного API. Принимает extractedData и targetTool.",
        parameters: {
            type: "object",
            properties: {
                extractedData: {
                    type: "string",
                    description: "JSON строка с данными от fact_extractor"
                },
                targetTool: {
                    type: "enum",
                    enum: ["weather_api", "get_finance_data"],
                    description: "Целевой инструмент"
                }
            },
            required: ["extractedData", "targetTool"]
        }
    }
};

export async function handler(args) {
    try {
        const { extractedData, targetTool } = args;
        
        if (!extractedData || !targetTool) 
            return JSON.stringify({ error: "Требуется extractedData и targetTool" });
        
        let data;
        try {
            data = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData;
        } catch (e) {
            log('ERROR', 'api_formatter', 'parse_error', e.message);
            return JSON.stringify({ error: "Некорректный формат extractedData" });
        }

        if (targetTool === "weather_api") {
            const formatted = {};
            if (data.lat !== undefined && data.lon !== undefined) {
                formatted.lat = Number(data.lat);
                formatted.lon = Number(data.lon);
                log('INFO', 'api_formatter', 'formatted', `lat=${formatted.lat}, lon=${formatted.lon}`);
                return JSON.stringify(formatted);
            } else {
                return JSON.stringify({ error: "Отсутствуют lat/lon в extractedData" });
            }
        } else if (targetTool === "get_finance_data") {
            const formatted = {};
            if (data.symbol) {
                formatted.symbol = data.symbol;
            } else if (data.price_usd) {
                formatted.symbol = data.price_usd > 10000 ? 'BTC-USD' : 'ETH-USD';
            }
            formatted.type = "current";
            return JSON.stringify(formatted);
        }

        return JSON.stringify({ error: `Неподдерживаемый targetTool: ${targetTool}` });
    } catch (e) {
        log('ERROR', 'api_formatter', 'error', e.message);
        return JSON.stringify({ error: `Ошибка форматирования: ${e.message}` });
    }
}
