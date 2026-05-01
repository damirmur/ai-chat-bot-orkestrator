import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "web_search",
        description: "Веб-поиск для получения сырых данных. Используйте вместе с fact_extractor для извлечения структурированной информации.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Текст для поиска" }
            },
            required: ["query"]
        }
    }
};

export async function handler(args) {
    // Use searchUrl from args if provided, otherwise try cache/env
    let searchUrl = args.searchUrl;
    
    if (!searchUrl && global.__envCache__?.SEARCH_URL) {
        console.log('[ENV FALLBACK] Using SEARCH_URL from global cache');
        searchUrl = global.__envCache__.SEARCH_URL;
    } else if (!searchUrl) {
        searchUrl = process.env.SEARCH_URL;
        
        if (searchUrl !== undefined && searchUrl !== '') {
            console.log('[ENV FALLBACK] Using SEARCH_URL from environment');
            if (!global.__envCache__) global.__envCache__ = {};
            global.__envCache__.SEARCH_URL = searchUrl;
        } else {
            log('ERROR', 'web_search', 'config_error', 'SEARCH_URL не указан в .env');
            return JSON.stringify({ error: "SEARCH_URL не указан в .env" });
        }
    }

    log('INFO', 'web_search', 'request', `query: ${args.query}`);
    
    try {
        const fullUrl = `${searchUrl}?q=${encodeURIComponent(args.query)}&format=json`;
        
        const response = await fetch(fullUrl);
        if (!response.ok) throw new Error(`SearXNG error: ${response.status}`);
        
        const data = await response.json();
        
        const results = data.results?.slice(0, 4).map(r => ({
            title: r.title,
            snippet: r.content,
            url: r.url
        }));

        if (!results || results.length === 0) {
            log('INFO', 'web_search', 'no_results', `query: ${args.query}`);
            return JSON.stringify({ text: "Не удалось найти результаты поиска." });
        }

        log('INFO', 'web_search', 'results', `${results.length} результатов`);
        const text = results.map((r, i) => `${i+1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`).join('\n\n');
        return JSON.stringify({ text: text });
        
    } catch (error) {
        log('ERROR', 'web_search', 'error', error.message);
        return JSON.stringify({ error: `Ошибка поиска-запроса: ${error.message}` });
    }
}
