import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "get_finance_data",
        description: "Получить финансовые данные: цену или историю. type=historical возвращает данные за период. Используй startDate/endDate (YYYY-MM-DD) для точного периода, range как fallback.",
        parameters: {
            type: "object",
            properties: {
                symbol: { type: "string", description: "Символ: BTC-USD, RUB=X, GC=F, EUR=RUB и т.д." },
                type: { type: "string", enum: ["current", "historical"], description: "current - текущая цена, historical - история" },
                startDate: { type: "string", description: "Дата начала: YYYY-MM-DD" },
                endDate: { type: "string", description: "Дата конца: YYYY-MM-DD" },
                range: { type: "string", enum: ["1mo", "1y", "5y"], description: "Период (fallback): 1mo, 1y, 5y" }
            },
            required: ["symbol", "type"]
        }
    }
};

let yfInstance = null;

async function getYf() {
    if (yfInstance) return yfInstance;
    
    const module = await import('yahoo-finance2');
    
    const Constructor = module.YahooFinance || module.default?.YahooFinance || module.default;
    
    try {
        yfInstance = new Constructor();
    } catch (e) {
        yfInstance = Constructor;
    }
    
    return yfInstance;
}

export async function handler(args) {
    const symbol = args.symbol.toUpperCase();
    try {
        const yf = await getYf();

        if (args.type === "current") {
            log('INFO', 'yahoo_finance', 'request', `current: ${symbol}`);
            
            const quote = await yf.quote(symbol);
            log('INFO', 'yahoo_finance', 'quote_received', Object.keys(quote).length + ' fields');
            
            if (!quote) return JSON.stringify({ error: "Данные не найдены" });
            
            const price = quote.regularMarketPrice ?? quote.bid ?? quote.ask ?? quote.previousClose ?? quote.lastPrice ?? quote.close;
            log('INFO', 'yahoo_finance', 'price', `${price}`);
            
            if (!price) return JSON.stringify({ error: "Цена не найдена", symbol });
            
            return JSON.stringify({
                symbol: symbol,
                price: price,
                currency: quote.currency || "USD"
            });
        }

        if (args.type === "historical") {
            let startDate, endDate;
            const range = args.range || '1y';
            
            if (args.startDate && args.endDate) {
                startDate = new Date(args.startDate);
                endDate = new Date(args.endDate);
                log('INFO', 'yahoo_finance', 'historical', `${args.startDate} -> ${args.endDate}, symbol=${symbol}`);
            } else {
                endDate = new Date();
                if (range === '1mo') startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
                else if (range === '1y') startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
                else if (range === '5y') startDate = new Date(endDate.getTime() - 1825 * 24 * 60 * 60 * 1000);
                else startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
                log('INFO', 'yahoo_finance', 'historical_range', `range=${range}, symbol=${symbol}`);
            }

            const result = await yf.chart(symbol, { period1: startDate, period2: endDate, interval: '1mo' });
            const history = result.quotes.map(q => ({
                date: q.date.toISOString().split('T')[0],
                dateLabel: q.date.toLocaleString('ru-RU', { month: 'short', year: '2-digit' }),
                price: q.close?.toFixed(2)
            }));
            log('INFO', 'yahoo_finance', 'history', `${history.length} months, from ${history[0]?.date} to ${history[history.length-1]?.date}`);
            return JSON.stringify({ symbol, history, currency: 'USD', startDate: args.startDate, endDate: args.endDate, url: `https://yahoo.com${symbol}/chart` });
        }
    } catch (error) {
        log('ERROR', 'yahoo_finance', 'error', error.message);
        return JSON.stringify({ error: `Ошибка модуля финансов: ${error.message}` });
    }
}
