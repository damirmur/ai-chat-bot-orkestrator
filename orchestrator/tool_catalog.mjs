/**
 * TOOL CATALOG — Minimal reference for model planning at startup
 * Model sees ONLY this information to avoid context overload
 * 
 * Each entry tells the model WHAT a tool does and WHETHER it returns clean data or raw data
 */

export const TOOL_CATALOG = {
    // === API TOOLS - Return final results directly to user ===
    
    weather_api: {
        name: "weather_api",
        purpose: "Получает актуальную погоду по координатам. Требует lat/lon в числовом формате. Возвращает температуру и условия погоды — готовый ответ пользователю.",
        isAtomic: true // Вернёт готовый текст для пользователя
    },
    
    get_finance_data: {
        name: "get_finance_data", 
        purpose: "Получает цены криптовалют, металлов и валют с бирж. Требует символ актива (BTC-USD, GC=F) и тип данных (current/historical). Возвращает цену — готовый ответ.",
        isAtomic: true
    },
    
    draw_chart: {
        name: "draw_chart", 
        purpose: "Создаёт столбчатую диаграмму из меток и числовых значений. Результат — изображение (PNG). Готовый ответ пользователю.",
        isAtomic: true
    },
    
    render_table: {
        name: "render_table",
        purpose: "Создаёт табличный вывод данных. Результат — изображение (PNG). Готовый ответ пользователю.",
        isAtomic: true
    },
    
    reply: {
        name: "reply", 
        purpose: "Прямой текстовый ответ без вызова других инструментов. Используйте для простых вопросов-ответов.",
        isAtomic: true
    },
    
    // === FACT TOOLS - Return processed/clean data (may need further processing) ===
    
    fact_lookup: {
        name: "fact_lookup", 
        purpose: "Получает постоянные факты из внутренней базы: координаты городов, столицы стран, валюты. Возвращает чистые данные lat/lon или null если города нет в базе.",
        isAtomic: true // Чистые данные, можно передать напрямую weather_api
    },
    
    get_system_time: {
        name: "get_system_time", 
        purpose: "Получает текущее время системы. Возвращает дату/время — полезно для актуализации ответов.",
        isAtomic: true
    },
    
    // === RAW DATA SOURCES - Return unprocessed data (REQUIRES processing before API use) ===
    
    web_search: {
        name: "web_search", 
        purpose: "Ищет информацию в интернете через поисковик. ВСЕГДА возвращает сырой текст/HTML — НУЖНО обрабатывать факт-экстрактором перед использованием другими инструментами!",
        isAtomic: false // Сырые данные! Требует fact_extractor → api_formatter chain
    },
    
    model_tool: {
        name: "model_tool", 
        purpose: "Вызов модели для обработки текста (перевод, анализ, форматирование). Принимает сырой текст от других инструментов и преобразует. Может использоваться как промежуточный шаг.",
        isAtomic: false // Обычно промежуточный результат
    },
    
    // === PROCESSING TOOLS - Transform raw data into usable format ===
    
    fact_extractor: {
        name: "fact_extractor", 
        purpose: "Извлекает структурированные данные из сырого текста (координаты, цены, названия). Принимает сырой текст от web_search и преобразует в JSON. Выход всё ещё требует api_formatter для некоторых API.",
        isAtomic: false // Выход нужно обработать api_formatter перед API call
    },
    
    api_formatter: {
        name: "api_formatter", 
        purpose: "Преобразует извлечённые данные в формат конкретного API. Принимает extractedData и указывает targetTool (например 'weather_api'). Выдаёт строго то что требует этот инструмент (числа для погоды, символы для финансов). Использовать ПРЯМО ПОСЛЕ fact_extractor!",
        isAtomic: false // Выход готов для целевого API, но не финальный ответ пользователю
    },
    
    // === SPECIAL CASES ===
    
    shell_command: {
        name: "shell_command", 
        purpose: "Выполнение системных команд. ДОСТУПНО ТОЛЬКО авторизованному пользователю (проверяется peerId == USER_ID). Возвращает вывод команды или ошибку доступа.",
        isAtomic: true // Ответ готов, но требует проверки доступа!
    }
};

// Helper to check if tool is atomic (returns final result)
export function isToolAtomic(toolName) {
    const tool = TOOL_CATALOG[toolName];
    return !tool || tool.isAtomic === true;
}

// Helper to get tools that require processing
export function getToolsRequiringProcessing() {
    return Object.entries(TOOL_CATALOG).filter(([_, info]) => !info.isAtomic)
        .map(([name]) => name);
}
