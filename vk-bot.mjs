import { loadEnvFile } from 'node:process';
import { VK } from 'vk-io';
import fs from 'node:fs';
import path from 'node:path';

// Загрузка .env
try { loadEnvFile(); } catch (e) { console.error("Файл .env не найден"); }

const vk = new VK({ token: process.env.VK_TOKEN });
const API_URL = `${process.env.LM_STUDIO_URL.replace(/\/$/, '')}/chat/completions`;
const API_TOKEN = process.env.LM_STUDIO_API_KEY || 'lm-studio';

const toolsDefinition = [];
const toolsHandlers = {};

// --- АВТОЗАГРУЗКА ИНСТРУМЕНТОВ ---
async function loadTools() {
    const toolsPath = path.join(process.cwd(), 'tools');
    if (!fs.existsSync(toolsPath)) fs.mkdirSync(toolsPath);
    const files = fs.readdirSync(toolsPath).filter(file => file.endsWith('.mjs'));
    for (const file of files) {
        try {
            const tool = await import(`file://${path.join(toolsPath, file)}`);
            if (tool.definition && tool.handler) {
                toolsDefinition.push(tool.definition);
                toolsHandlers[tool.definition.function.name] = tool.handler;
                console.log(`✅ Инструмент загружен: ${tool.definition.function.name}`);
            }
        } catch (err) {
            console.error(` !!! Ошибка загрузки инструмента ${file}:`, err.message);
        }
    }
}
await loadTools();

// Функция запроса к LM Studio
async function askLM(messages, useTools = true) {
    const body = {
        model: process.env.MODEL_NAME || "local-model",
        messages: messages,
        temperature: 0.3,
        max_tokens: 1500,
        ...(useTools && { tools: toolsDefinition, tool_choice: "auto" })
    };

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_TOKEN}`
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message;
}

vk.updates.on('message_new', async (context) => {
    if (context.isOutbox || !context.text) return;

    const botMention = new RegExp(`(\\[club${process.env.GROUP_ID}\\|.*?\\]|бот)`, 'i');
    if (!botMention.test(context.text) && context.peerId === Number(process.env.CHAT_PEER_ID)) return;
    
    let cleanText = context.text.replace(botMention, '').trim();
    
    // Системный промпт (усиленный)
    let history = [
        { 
            role: 'system', 
            content: "Ты — ассистент-визуализатор.\n\nДля данных ВСЕГДА указывай source: 0 (первый шаг с данными).\n\nДля графиков: execute_plan → draw_chart.\nДля таблиц: execute_plan → render_table.\n\nПример график и таблица:\n{\n  \"steps\": [\n    {\"id\": 0, \"tool\": \"get_finance_data\", \"args\": {\"symbol\": \"BTC-USD\", \"type\": \"historical\", \"range\": \"1y\"}},\n    {\"id\": 1, \"tool\": \"draw_chart\", \"args\": {\"title\": \"BTC\", \"source\": 0, \"key_labels\": \"date\", \"key_values\": \"price\"}},\n    {\"id\": 2, \"tool\": \"render_table\", \"args\": {\"title\": \"BTC\", \"source\": 0}}\n  ]\n}\n\nЗАПРЕЩЕНО рисовать графики текстом." 
        },
        { role: 'user', content: cleanText }
    ];

    try {
        await context.setActivity();
        console.log(`[${new Date().toLocaleTimeString()}] Запрос: ${cleanText}`);

        let aiMessage = await askLM(history);
        let attachments = [];

        // Обработка инструментов
        if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
            history.push(aiMessage);
            for (const toolCall of aiMessage.tool_calls) {
                const name = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                console.log(` -> Исполняю: ${name}`);
                
                let result;
                
                // Если это execute_plan - передаём toolsHandlers
                if (name === "execute_plan") {
                    result = await toolsHandlers[name](args, toolsHandlers);
                } else {
                    result = await toolsHandlers[name](args);
                }
                
                // Проверка на base64 изображение
                try {
                    const resultObj = JSON.parse(result);
                    console.log(' -> Ключи в результате:', Object.keys(resultObj));
                    if (resultObj.error) {
                        console.error(' -> Ошибка инструмента:', resultObj.error);
                    }
                    
                    // Одиночное изображение
                    if (resultObj.image && resultObj.image.startsWith('data:image/png;base64,')) {
                        console.log(' -> НАЙДЕН image! Загружаю фото...');
                        const base64Data = resultObj.image.replace('data:image/png;base64,', '');
                        const buffer = Buffer.from(base64Data, 'base64');
                        const photo = await vk.upload.messagePhoto({
                            source: { value: buffer }
                        });
                        attachments.push(photo);
                        console.log(` -> Фото загружено: ${resultObj.title || 'график'}`);
                        result = JSON.stringify({ text: `Изображение "${resultObj.title}" прикреплено 📊` });
                    }
                    // Массив изображений
                    else if (resultObj.images && Array.isArray(resultObj.images)) {
                        console.log(` -> Найдено ${resultObj.images.length} изображений`);
                        for (const img of resultObj.images) {
                            if (img.image && img.image.startsWith('data:image/png;base64,')) {
                                const base64Data = img.image.replace('data:image/png;base64,', '');
                                const buffer = Buffer.from(base64Data, 'base64');
                                const photo = await vk.upload.messagePhoto({
                                    source: { value: buffer }
                                });
                                attachments.push(photo);
                                console.log(` -> Фото загружено: ${img.title || img.tool}`);
                            }
                        }
                        result = JSON.stringify({ text: `${resultObj.images.length} изображения прикреплены 📊` });
                    } else {
                        console.log(' -> Нет image в результате');
                    }
                } catch (e) {
                    console.error(' -> Ошибка парсинга:', e.message);
                }
                
                history.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: name,
                    content: String(result)
                });
                
                // Если execute_plan вернул картинку - не делаем второй запрос
                if (attachments.length > 0) {
                    aiMessage = { content: "" };
                    break;
                }
            }
            
            // Второй запрос только если нет картинки
            if (!aiMessage.content && !attachments.length) {
                aiMessage = await askLM(history, false);
            }
        }

        let replyText = aiMessage.content || "";

        // Обработка base64 из message
        const base64Regex = /data:image\/png;base64,([A-Za-z0-9+\/=]+)/;
        const base64Match = replyText.match(base64Regex);
        
        if (base64Match) {
            try {
                const base64Data = base64Match[1];
                const buffer = Buffer.from(base64Data, 'base64');
                const photo = await vk.upload.messagePhoto({
                    source: { value: buffer }
                });
                attachments.push(photo);
                console.log(` -> Фото загружено из сообщения`);
                replyText = replyText.replace(base64Regex, '(график прикреплен 📊)');
            } catch (err) {
                console.error(" !!! Ошибка загрузки фото:", err.message);
            }
        }

        // Старая логика для URL (резерв)
        const urlRegex = /https?:\/\/[^\s"']+\.png/gi;
        const foundUrls = replyText.match(urlRegex);

        if (foundUrls) {
            for (const url of foundUrls) {
                try {
                    console.log(` -> Скачиваю медиа: ${url.substring(0, 50)}...`);
                    const imgRes = await fetch(url);
                    if (!imgRes.ok) throw new Error(`Ошибка загрузки: ${imgRes.status}`);
                    
                    const buffer = Buffer.from(await imgRes.arrayBuffer());
                    const photo = await vk.upload.messagePhoto({
                        source: { value: buffer }
                    });
                    
                    attachments.push(photo);
                    // Убираем длинную ссылку и Markdown-разметку из текста
                    replyText = replyText.replace(new RegExp(`!?\\[.*?\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)|${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '(график прикреплен 📊)');
                } catch (err) {
                    console.error(" !!! Ошибка загрузки медиа:", err.message);
                }
            }
        }

        // Обрезаем аномально длинные ответы (защита от циклов)
        if (replyText.length > 3500) replyText = replyText.substring(0, 3000) + "... [текст обрезан]";

        if (replyText || attachments.length > 0) {
            await context.send({
                message: replyText.trim(),
                attachment: attachments,
                reply_to: context.id
            });
            console.log(' -> Ответ отправлен успешно');
        }

    } catch (error) {
        console.error(' !!! Ошибка Агента:', error.message);
        await context.send(`⚠️ Ошибка: ${error.message}`);
    }
});

vk.updates.start().then(() => console.log('🚀 Бот-агент запущен!'));
