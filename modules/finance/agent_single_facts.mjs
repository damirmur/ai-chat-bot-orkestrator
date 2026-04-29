import { loadEnvFile } from 'node:process';
import path from 'node:path';
try { loadEnvFile(); } catch (e) {}

export const definition = {
    type: "function",
    function: {
        name: "agent_single_facts",
        description: "АГЕНТ для получения единичных финансовых фактов (курсы валют, цены криптовалют, металлов). ИСПОЛЬЗУЙ для запросов: 'курс доллара', 'цена биткоина', 'сколько стоит золото'. Возвращает готовый текстовый ответ. НЕ используй get_finance_data напрямую - используй этот агент!",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Запрос: 'курс доллара', 'цена биткоина', 'сколько стоит золото'. ОБЯЗАТЕЛЬНО используй этот агент для единичных финансовых фактов!"
                }
            },
            required: ["query"]
        }
    }
};

const ASSET_MAP = {
    'биткоин': { symbol: 'BTC-USD', name: 'Биткоин', symbolShort: 'BTC', isCrypto: true },
    'bitcoin': { symbol: 'BTC-USD', name: 'Биткоин', symbolShort: 'BTC', isCrypto: true },
    'btc': { symbol: 'BTC-USD', name: 'Биткоин', symbolShort: 'BTC', isCrypto: true },
    'эфир': { symbol: 'ETH-USD', name: 'Эфириум', symbolShort: 'ETH', isCrypto: true },
    'ethereum': { symbol: 'ETH-USD', name: 'Эфириум', symbolShort: 'ETH', isCrypto: true },
    'eth': { symbol: 'ETH-USD', name: 'Эфириум', symbolShort: 'ETH', isCrypto: true },
    'золото': { symbol: 'GC=F', name: 'Золото', symbolShort: 'XAU', isMetal: true },
    'gold': { symbol: 'GC=F', name: 'Золото', symbolShort: 'XAU', isMetal: true },
    'серебро': { symbol: 'SI=F', name: 'Серебро', symbolShort: 'XAG', isMetal: true },
    'нефть': { symbol: 'CL=F', name: 'Нефть Brent', symbolShort: 'BRN', isCommodity: true },
    'доллар': { symbol: 'RUB=X', name: 'Доллар США', symbolShort: 'USD', isCurrency: true },
    'евро': { symbol: 'EUR=RUB', name: 'Евро', symbolShort: 'EUR', isCurrency: true },
    'юань': { symbol: 'CNY=RUB', name: 'Китайский юань', symbolShort: 'CNY', isCurrency: true },
    'рубль': { symbol: 'RUB=X', name: 'Рубль', symbolShort: 'RUB', isCurrency: true },
    'йена': { symbol: 'JPY=RUB', name: 'Японская йена', symbolShort: 'JPY', isCurrency: true }
};

function extractAssets(query) {
    const lower = query.toLowerCase();
    const assets = [];
    
    for (const [keyword, info] of Object.entries(ASSET_MAP)) {
        if (lower.includes(keyword)) {
            if (!assets.find(a => a.symbol === info.symbol)) {
                assets.push(info);
            }
        }
    }
    
    return assets;
}

function formatUSD(price) {
    if (!price) return null;
    return Number(price).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatRUB(price) {
    if (!price) return null;
    return Number(price).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

async function getPrice(toolsHandlers, symbol) {
    try {
        const data = await toolsHandlers['get_finance_data']({
            symbol: symbol,
            type: 'current'
        });
        const parsed = JSON.parse(data);
        if (parsed.error) return null;
        return parsed.price || parsed.priceUsd || null;
    } catch (e) {
        return null;
    }
}

export async function handler(args, toolsHandlers) {
    const { query } = args;
    
    console.log(`[agent_single_facts] Запрос: ${query}`);
    
    const assets = extractAssets(query);
    
    if (assets.length === 0) {
        console.log(`[agent_single_facts] Не найдены активы, использую веб-поиск`);
        const result = await toolsHandlers['web_search']({ query });
        return result;
    }
    
    console.log(`[agent_single_facts] Активы: ${assets.map(a => a.name).join(', ')}`);
    
    const hasCryptoOrMetal = assets.some(a => a.isCrypto || a.isMetal);
    
    let usdToRub = null;
    if (hasCryptoOrMetal) {
        usdToRub = await getPrice(toolsHandlers, 'RUB=X');
        console.log(`[agent_single_facts] Курс USD/RUB: ${usdToRub}`);
    }
    
    const results = [];
    
    for (const asset of assets) {
        console.log(`[agent_single_facts] Запрос цены: ${asset.symbol}`);
        
        const price = await getPrice(toolsHandlers, asset.symbol);
        
        if (!price) {
            results.push({ name: asset.name, error: 'нет данных' });
            continue;
        }
        
        if (asset.isCrypto || asset.isMetal) {
            let rubPrice = null;
            if (usdToRub) {
                rubPrice = price * usdToRub;
            }
            
            const line = rubPrice 
                ? `${asset.name}: $${formatUSD(price)} (≈ ${formatRUB(rubPrice)} ₽)`
                : `${asset.name}: $${formatUSD(price)} (курс рубля недоступен)`;
            
            results.push({ name: asset.name, line });
            console.log(`[agent_single_facts] ${line}`);
        } else if (asset.isCommodity) {
            const line = `${asset.name}: $${formatUSD(price)}`;
            results.push({ name: asset.name, line });
            console.log(`[agent_single_facts] ${line}`);
        } else if (asset.isCurrency) {
            const line = `${asset.name}: ${formatRUB(price)} ₽`;
            results.push({ name: asset.name, line });
            console.log(`[agent_single_facts] ${line}`);
        }
    }
    
    const lines = results.map(r => r.line || `${r.name}: недоступен`);
    let text = lines.join('\n');
    
    // Добавляем дату на которую запрашивали курс
    const now = new Date();
    const day = now.getDate();
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();
    const dateStr = `${day} ${monthName} ${year} года`;
    
    text += ` (курс на ${dateStr})`;
    
    console.log(`[agent_single_facts] Результат:\n${text}`);
    
    return JSON.stringify({ text });
}
