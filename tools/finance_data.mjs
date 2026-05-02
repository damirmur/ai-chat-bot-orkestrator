import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "get_finance_data",
        description: "Get stock, crypto or commodity prices from Yahoo Finance. Use for current prices (type=current) or historical data (type=historical). For date ranges use startDate/endDate in YYYY-MM-DD format, or range parameter as fallback.",
        parameters: {
            type: "object",
            properties: {
                symbol: { 
                    type: "string", 
                    description: "Stock/crypto/commodity ticker: BTC-USD, RUB=X, GC=F, EUR=USD, AAPL, etc."
                },
                type: { 
                    type: "string", 
                    enum: ["current", "historical"], 
                    description: "Type of data to retrieve"
                },
                startDate: { 
                    type: "string", 
                    description: "Start date for historical data (YYYY-MM-DD)"
                },
                endDate: { 
                    type: "string", 
                    description: "End date for historical data (YYYY-MM-DD)"
                },
                range: { 
                    type: "string", 
                    enum: ["1mo", "1y", "5y"], 
                    description: "Time range (fallback): 1mo, 1y, 5y"
                }
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
    // Validate required parameters
    if (!args.symbol || !args.type) {
        return JSON.stringify({ error: "Missing required parameters: symbol and type" });
    }

    const symbol = args.symbol.toUpperCase();
    
    try {
        const yf = await getYf();

        if (args.type === "current") {
            log('INFO', 'yahoo_finance', 'request', `current price for ${symbol}`);
            
            const quote = await yf.quote(symbol);
            log('INFO', 'yahoo_finance', 'quote_received', Object.keys(quote || {}).length + ' fields');
            
            if (!quote) return JSON.stringify({ error: "No data found for symbol" });
            
            const price = quote.regularMarketPrice ?? quote.bid ?? quote.ask ?? quote.previousClose ?? quote.lastPrice ?? quote.close;
            log('INFO', 'yahoo_finance', 'price', `${symbol}: ${price}`);
            
            if (!price) return JSON.stringify({ error: "Unable to get valid price", symbol });
            
            return JSON.stringify({
                symbol: symbol,
                price: parseFloat(price),
                currency: quote.currency || "USD"
            });
        }

        if (args.type === "historical") {
            let startDate, endDate;
            const range = args.range || '1y';
            
            if (args.startDate && args.endDate) {
                startDate = new Date(args.startDate);
                endDate = new Date(args.endDate);
                log('INFO', 'yahoo_finance', 'historical', `${symbol}: ${args.startDate} -> ${args.endDate}`);
            } else {
                endDate = new Date();
                if (range === '1mo') startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
                else if (range === '1y') startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
                else if (range === '5y') startDate = new Date(endDate.getTime() - 1825 * 24 * 60 * 60 * 1000);
                else startDate = endDate;
                log('INFO', 'yahoo_finance', 'historical_range', `${symbol}: range=${range}`);
            }

            const result = await yf.chart(symbol, { period1: startDate, period2: endDate, interval: '1mo' });
            
            const history = (result?.quotes || []).map(q => ({
                date: q.date.toISOString().split('T')[0],
                dateLabel: q.date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                price: parseFloat(q.close?.toFixed(2) || 0)
            }));
            
            log('INFO', 'yahoo_finance', 'history', `${symbol}: ${history.length} data points`);
            return JSON.stringify({ 
                symbol, 
                history, 
                currency: 'USD',
                startDate: args.startDate,
                endDate: args.endDate,
                url: `https://finance.yahoo.com/quote/${symbol}/chart`
            });
        }
    } catch (error) {
        log('ERROR', 'yahoo_finance', 'error', `${symbol}: ${error.message}`);
        return JSON.stringify({ error: `Failed to get data for ${symbol}: ${error.message}` });
    }
}
