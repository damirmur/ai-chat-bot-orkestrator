export const definition = {
    type: "function",
    function: {
        name: "web_search",
        description: "Поиск актуальной информации в интернете (новости, события, факты).",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Поисковый запрос" }
            },
            required: ["query"]
        }
    }
};

import { loadEnvFile } from 'node:process';
try { loadEnvFile(); } catch (e) {соnsole.warn("⚠️ Не удалось загрузить .env файл. Убедитесь, что он существует и содержит необходимые переменные."); } 

export async function handler(args) {
    const baseUrl = process.env.SEARCH_URL;
    
    if (!baseUrl) {
        return JSON.stringify({ error: "Переменная SEARCH_URL не найдена в .env" });
    }

    try {
        const fullUrl = `${baseUrl}?q=${encodeURIComponent(args.query)}&format=json`;
        
        const response = await fetch(fullUrl);
        if (!response.ok) throw new Error(`SearXNG вернул ошибку: ${response.status}`);
        
        const data = await response.json();
        
        const results = data.results?.slice(0, 4).map(r => ({
            title: r.title,
            snippet: r.content,
            url: r.url
        }));

        if (!results || results.length === 0) {
            return JSON.stringify({ text: "По вашему запросу ничего не найдено." });
        }

        // Format results as readable text
        const text = results.map((r, i) => `${i+1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`).join('\n\n');
        return JSON.stringify({ text: text });
        
    } catch (error) {
        return JSON.stringify({ error: `Ошибка веб-поиска: ${error.message}` });
    }
}
