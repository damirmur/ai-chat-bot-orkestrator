import { loadEnvFile } from 'node:process';
import { VK } from 'vk-io';
import fs from 'node:fs';
import path from 'node:path';

try { loadEnvFile(); } catch (e) { console.error('[ERROR] .env file not found'); }

const { ensureModelReady } = await import('./lm_model_manager.mjs');
await ensureModelReady();

const { handleRequest } = await import('./orchestrator/handler.mjs');

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "Ты — планировщик задач. Твоя единственная задача — составить план и вернуть его в формате JSON.\n\nВАЖНО: Текущая дата: 29 апреля 2026 года.\n\nОГРАНИЧЕНИЯ:\n- НЕ выполняй задачи сам — только планируй\n- НЕ используй tool_calls — верни текстом только JSON\n- НЕ переводи/не анализируй текст самим собой — используй model_tool в плане\n- ВСЕГДА используй source для передачи данных между шагами\n- НЕ передавай period и range вместе — выбери что-то одно!\n- draw_chart НЕЛЬЗЯ передавать labels или values напрямую — ТОЛЬКО source!\n- ВСЕГДА добавляй шаг для КАЖДОГО актива! Если биткоин и золото = 2 шага get_finance_data!\n\nФОРМАТ ОТВЕТА (только JSON, без текста):\n{\"steps\": [{\"tool\": \"имя_инструмента\", \"args\": {...}}, ...]}\n\nДОСТУПНЫЕ ИНСТРУМЕНТЫ:\n- date_period — вычислить даты для периода (period: \"2025\" или range: \"1y\", НЕ ОБА)\n- agent_data_request — получить данные (финансы, погода, новости)\n- agent_fin_period_table_graph — построить график/таблицу за период\n- model_tool — перевод/анализ/форматирование текста (action: translate, summarize, analyze, format, extract, compare, explain, rewrite)\n- draw_chart — столбчатая диаграма (поддерживает несколько серий)\n- render_table — таблица\n- get_finance_data — финансовые данные (symbol: BTC-USD, GC=F, RUB=X, EUR=RUB, type: current/historical)\n- web_search — веб-поиск\n\nПРАВИЛА:\n- date_period с range=\"1y\" = последние 12 месяцев (апрель 2025 — апрель 2026)\n- date_period с period=\"2025\" = год 2025 (Янв 2025 — Дек 2025)\n- draw_chart с source=[0,1,2,3] для нескольких активов:\n  - source[0] = date_period (labels)\n  - source[1] = первый актив (BTC)\n  - source[2] = второй актив (GC)\n  - source[3] = курс валюты (если нужен)\n- ВАЖНО: source массив должен включать ВСЕ индексы шагов с данными!\n- source=[0,1,2] означает: 0=labels, 1=BTC, 2=GC\n- draw_chart АРГУМЕНТЫ: {\"title\": \"Название, RUB\", \"source\": [0,1,2]}\n\nПРИМЕРЫ:\nЗапрос: \"Курс биткоина\" → {\"steps\": [{\"tool\": \"agent_data_request\", \"args\": {\"query\": \"курс биткоина\"}}]}\nЗапрос: \"Курс золота за год\" → {\"steps\": [{\"tool\": \"date_period\", \"args\": {\"range\": \"1y\", \"target\": \"chart\"}}, {\"tool\": \"get_finance_data\", \"args\": {\"symbol\": \"GC=F\", \"type\": \"historical\", \"source\": 0}}, {\"tool\": \"draw_chart\", \"args\": {\"title\": \"Золото, USD\", \"source\": 0}}]}\nЗапрос: \"BTC и золото в рублях на одном графике\" → {\"steps\": [{\"tool\": \"date_period\", \"args\": {\"range\": \"1y\", \"target\": \"chart\"}}, {\"tool\": \"get_finance_data\", \"args\": {\"symbol\": \"BTC-USD\", \"type\": \"historical\", \"source\": 0}}, {\"tool\": \"get_finance_data\", \"args\": {\"symbol\": \"GC=F\", \"type\": \"historical\", \"source\": 0}}, {\"tool\": \"get_finance_data\", \"args\": {\"symbol\": \"RUB=X\", \"type\": \"current\"}}, {\"tool\": \"draw_chart\", \"args\": {\"title\": \"BTC и Золото, RUB\", \"source\": [0,1,2,3]}}]}\nЗапрос: \"Переведи\" → {\"steps\": [{\"tool\": \"model_tool\", \"args\": {\"action\": \"translate\", \"text\": \"...\", \"target_lang\": \"ru\"}}]}\n\nЕсли не нужен инструмент — верни просто текст (не JSON).";

const vk = new VK({ token: process.env.VK_TOKEN });
const API_URL = (process.env.LM_STUDIO_URL.replace(/\/$/, '') || 'http://localhost:1234') + '/chat/completions';
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
            const tool = await import('file://' + path.join(toolsPath, file).replace(/\\/g, '/'));
            if (tool.definition && tool.handler) {
                toolsDefinition.push(tool.definition);
                toolsHandlers[tool.definition.function.name] = tool.handler;
                console.log('[OK] Tool loaded: ' + tool.definition.function.name);
            }
        } catch (err) {
            console.error('[ERROR] Failed to load tool ' + file + ': ' + err.message);
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
            'Authorization': 'Bearer ' + API_TOKEN
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message;
}

toolsHandlers.askLM = askLM;

vk.updates.on('message_new', async (context) => {
    if (context.isOutbox || !context.text) return;

    const botMention = new RegExp('(\\[club' + process.env.GROUP_ID + '\\|.*?\\]|бот)', 'i');
    if (!botMention.test(context.text) && context.peerId === Number(process.env.CHAT_PEER_ID)) return;
    
    const query = context.text.replace(botMention, '').trim();
    
    try {
        await context.setActivity();
        console.log('[' + new Date().toLocaleTimeString() + '] Query: ' + query);

        const responses = await handleRequest(query, toolsHandlers, askLM, SYSTEM_PROMPT);
        
        let imageSent = false;
        for (const response of responses) {
            if (response.type === 'image') {
                const base64Data = response.data.replace('data:image/png;base64,', '');
                const buffer = Buffer.from(base64Data, 'base64');
                const photo = await vk.upload.messagePhoto({ source: { value: buffer } });
                await context.send({ attachment: photo, reply_to: context.id });
                console.log('[bot] -> Image sent (photo' + (photo.owner_id || process.env.GROUP_ID) + '_' + photo.id + ')');
                imageSent = true;
            }
            else if (response.type === 'text' && response.content) {
                let text = response.content;
                if (text.length > 3500) text = text.substring(0, 3000) + "... [текст обрезан]";
                await context.send({ message: text.trim(), reply_to: context.id });
                console.log(' -> Text sent');
            }
        }
        
        if (responses.length === 0) {
            await context.send({ message: "No response received", reply_to: context.id });
        }
        
        if (imageSent) {
            await context.send({ message: "Запрос успешно завершён, готова к следующим запросам", reply_to: context.id });
        }

    } catch (error) {
        console.error('[ERROR] ' + error.message);
        await context.send('[ERROR] ' + error.message);
    }
});

vk.updates.start().then(() => console.log('🚀 Бот-агент запущен!'));
