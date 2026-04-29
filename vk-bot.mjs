import { loadEnvFile } from 'node:process';
import { VK } from 'vk-io';
import fs from 'node:fs';
import path from 'node:path';

try { loadEnvFile(); } catch (e) { console.error('[ERROR] .env file not found'); }

const { ensureModelReady } = await import('./lm_model_manager.mjs');
await ensureModelReady();

const { handleRequest } = await import('./orchestrator/handler.mjs');

const { FINANCE_PROMPT } = await import('./modules/finance/prompts.mjs');
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || FINANCE_PROMPT;

const vk = new VK({ token: process.env.VK_TOKEN });
const API_URL = (process.env.LM_STUDIO_URL.replace(/\/$/, '') || 'http://localhost:1234') + '/chat/completions';
const API_TOKEN = process.env.LM_STUDIO_API_KEY || 'lm-studio';

const toolsDefinition = [];
const toolsHandlers = {};

// --- АВТОЗАГРУЗКА ИНСТРУМЕНТОВ И АГЕНТОВ ---
async function loadTools() {
    // Загрузка из tools/
    const toolsPath = path.join(process.cwd(), 'tools');
    if (!fs.existsSync(toolsPath)) fs.mkdirSync(toolsPath);
    let files = fs.readdirSync(toolsPath).filter(file => file.endsWith('.mjs'));
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
    
    // Загрузка агентов из modules/finance/
    const agentsPath = path.join(process.cwd(), 'modules', 'finance');
    if (fs.existsSync(agentsPath)) {
        files = fs.readdirSync(agentsPath).filter(file => file.endsWith('.mjs') && file.startsWith('agent_'));
        for (const file of files) {
            try {
                const agent = await import('file://' + path.join(agentsPath, file).replace(/\\/g, '/'));
                if (agent.definition && agent.handler) {
                    toolsDefinition.push(agent.definition);
                    toolsHandlers[agent.definition.function.name] = agent.handler;
                    console.log('[OK] Agent loaded: ' + agent.definition.function.name);
                }
            } catch (err) {
                console.error('[ERROR] Failed to load agent ' + file + ': ' + err.message);
            }
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
