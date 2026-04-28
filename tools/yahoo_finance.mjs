export const definition = {
    type: "function",
    function: {
        name: "get_finance_data",
        description: "Получить финансовые данные: цену или историю (BTC-USD, GC=F, RUB=X, AAPL).",
        parameters: {
            type: "object",
            properties: {
                symbol: { type: "string" },
                type: { type: "string", enum: ["current", "historical"] },
                range: { type: "string", enum: ["1mo", "1y", "5y"] }
            },
            required: ["symbol", "type"]
        }
    }
};

let yfInstance = null;

async function getYf() {
    if (yfInstance) return yfInstance;
    
    // Динамически импортируем весь модуль
    const module = await import('yahoo-finance2');
    
    // Пытаемся найти конструктор в разных местах (зависит от сборки библиотеки)
    const Constructor = module.YahooFinance || module.default?.YahooFinance || module.default;
    
    try {
        yfInstance = new Constructor();
    } catch (e) {
        // Если это не конструктор, значит объект уже готов к работе
        yfInstance = Constructor;
    }
    
    return yfInstance;
}

export async function handler(args) {
    const symbol = args.symbol.toUpperCase();
    try {
        const yf = await getYf();

        if (args.type === "current") {
            const quote = await yf.quote(symbol);
            if (!quote) return "Данные не найдены.";
            
            const price = quote.regularMarketPrice || quote.bid || quote.ask || quote.previousClose;
            return JSON.stringify({
                symbol: symbol,
                price: price,
                currency: quote.currency || "USD",
                url: `https://yahoo.com{symbol}`
            });
        }

        if (args.type === "historical") {
            let startDate = new Date();
            if (args.range === '1mo') startDate.setMonth(startDate.getMonth() - 1);
            else if (args.range === '1y') startDate.setFullYear(startDate.getFullYear() - 1);
            else if (args.range === '5y') startDate.setFullYear(startDate.getFullYear() - 5);

            const result = await yf.chart(symbol, { period1: startDate, interval: '1mo' });
            const history = result.quotes.slice(-10).map(q => ({
                date: q.date.toISOString().split('T')[0],
                price: q.close?.toFixed(2)
            }));
            return JSON.stringify({ symbol, history, url: `https://yahoo.com{symbol}/chart` });
        }
    } catch (error) {
        return `Ошибка модуля финансов: ${error.message}`;
    }
}
