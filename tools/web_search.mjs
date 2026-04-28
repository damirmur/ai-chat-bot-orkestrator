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
    // Берем URL из системного окружения (то, что мы прописывали в .env)
    const baseUrl = process.env.SEARCH_URL;
    
    if (!baseUrl) {
        return "Ошибка: Переменная SEARCH_URL не найдена в .env";
    }

    try {
        // Добавляем format=json для SearXNG
        const fullUrl = `${baseUrl}?q=${encodeURIComponent(args.query)}&format=json`;
        
        const response = await fetch(fullUrl);
        if (!response.ok) throw new Error(`SearXNG вернул ошибку: ${response.status}`);
        
        const data = await response.json();
        
        // Берем топ-4 результата и оставляем только суть
        const results = data.results?.slice(0, 4).map(r => ({
            title: r.title,
            snippet: r.content,
            url: r.url
        }));

        if (!results || results.length === 0) {
            return "По вашему запросу ничего не найдено.";
        }

        return JSON.stringify(results);
    } catch (error) {
        return `Ошибка при выполнении веб-поиска: ${error.message}`;
    }
}
