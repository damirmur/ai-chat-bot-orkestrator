import { readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

try { loadEnvFile(); } catch (e) { console.error('[ERROR] .env file not found'); process.exit(1); }

await import('./orchestrator/tools_loader.mjs');
const { loadAllTools, getLoadedTools, getAllTools, exportedHandlers } = await import('./orchestrator/tools_loader.mjs');
await loadAllTools();

import { log, logColor, closeLogger } from './logger.mjs';

logColor('INFO', 'INDEX', 'startup', `Loading tools and handlers`, 'success');

getLoadedTools().forEach((tool, name) => { global[name] = tool.handler; });

// Экспорт askLM для использования в tools
global.askLM = askLM;

Object.entries(exportedHandlers).forEach(([name, handler]) => {
    const definition = getLoadedTools().get(name)?.definition;
    if (definition) { global[name] = handler; }
});

logColor('INFO', 'INDEX', 'tools', `✓ Loaded ${getAllTools().size} tools`, 'success');

const { handleRequest } = await import('./orchestrator/handler.mjs');

// Импорт коммуникационных модулей
import * as vkBot from './communication/vk-bot.mjs';
import * as terminalChat from './communication/terminal-chat.mjs';

logColor('INFO', 'INDEX', 'startup', `Loading tools and handlers`, 'success');

async function askLM(messages, useTools = true) {
    const normalizeToolDefinition = (toolDef) => {
        if (!toolDef || typeof toolDef !== 'object') return null;
        
        let name, description, parameters;
        
        if (toolDef.function?.name) {
            name = toolDef.function.name;
            description = toolDef.function.description || '';
            parameters = toolDef.function.parameters || {};
        } 
        else if (toolDef.name && toolDef.parameters) {
            name = toolDef.name;
            description = toolDef.description || '';
            parameters = toolDef.parameters;
        } 
        else {
            return null;
        }
        
        const normalizedParams = {
            type: 'object',
            properties: {}
        };
        
        if (parameters.type && parameters.properties) {
            normalizedParams.type = parameters.type;
            normalizedParams.properties = parameters.properties;
            
            if (Array.isArray(parameters.required)) {
                normalizedParams.required = parameters.required;
            }
        } 
        else if (typeof parameters === 'object' && !Array.isArray(parameters)) {
            Object.assign(normalizedParams, parameters);
        }
        
        return {
            type: "function",
            function: {
                name,
                description,
                parameters: normalizedParams
            }
        };
    };
    
    const toolsDefinition = Array.from(getLoadedTools().values())
        .map(t => normalizeToolDefinition(t.definition))
        .filter(Boolean);

    log('DEBUG', 'INDEX', 'tools_normalized', `Normalized ${toolsDefinition.length} tools`);
    const body = {
        model: process.env.MODEL_NAME || "local-model",
        messages: messages,
        temperature: 0.3,
        max_tokens: 1500,
...(useTools && { tools: toolsDefinition })
    };
    const API_URL = (process.env.LM_STUDIO_URL.replace(/\/$/, '') || 'http://localhost:1234') + '/chat/completions';
    let rawData = null;
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            try {
                rawData = await response.json();
                log('ERROR', 'INDEX', 'api_error_response', JSON.stringify(rawData));
            } catch (e) {
                const text = await response.text();
                log('ERROR', 'INDEX', 'api_error_text', text.substring(0, 500));
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        rawData = await response.json();
        if (rawData.error) {
            log('ERROR', 'INDEX', 'model_error_response', JSON.stringify(rawData));
            throw new Error(rawData.error.message);
        }
        return rawData.choices[0].message;
    } catch (error) {
        log('ERROR', 'INDEX', 'asklm_exception', `Full error: ${JSON.stringify({ message: error.message, rawData })}`);
        if (rawData && !error.message.includes(error.message)) {
            log('ERROR', 'INDEX', 'api_raw_response', JSON.stringify(rawData, null, 2));
        }
        throw error;
    }
}

const USER_ID = Number(process.env.USER_ID);
if (!USER_ID || isNaN(USER_ID)) {
    console.error('\x1b[31m\x1b[1mERROR: USER_ID not configured in .env file!\x1b[0m');
    process.exit(1);
}

// История разговора для сохранения контекста между запросами
const conversationHistory = [];

/**
 * Добавляет сообщение в историю разговора
 * @param {string} role - роль (user/assistant/system)
 * @param {string} content - содержание сообщения
 */
function addToHistory(role, content) {
    conversationHistory.push({ role, content: content.trim() });
}

/**
 * Очищает историю разговора
 */
function clearHistory() {
    conversationHistory.length = 0;
    log('INFO', 'INDEX', 'history_cleared', 'История разговора очищена');
}

/**
 * Возвращает историю разговора
 */
function getHistory() {
    return [...conversationHistory];
}

/**
 * Dynamically generates tool descriptions from loaded tools map
 * Returns formatted text string to append to system prompt
 */
function formatToolsDescription(loadedTools) {
    const tools = Array.from(loadedTools.values())
        .map(tool => ({
            name: tool.definition.function?.name || tool.definition.name || 'unknown',
            description: tool.definition.description || ''
        }))
        .sort((a, b) => a.name.localeCompare('en')); // English alphabetical order
    
    if (tools.length === 0) {
        return '\nNo tools available.\n';
    }
    
    const lines = ['Available tools:'];
    
    for (const tool of tools) {
        lines.push(`- ${tool.name}: ${tool.description}`);
    }
    
    lines.push(''); // Empty line at end
    
    return lines.join('\n') + '\n';
}

async function handleQuery(query, useTools = true) {
    log('DEBUG', 'INDEX', 'query_start', `Starting query for: ${query}`);
    
    // Load base system prompt from file
    const BASE_PROMPT = readFileSync('sys.prompt', 'utf-8').trim();
    
    // Dynamically generate tools description from loaded tools
    const availableToolsText = formatToolsDescription(getLoadedTools());
    
    // Combine prompts with tools information
    const SYSTEM_PROMPT = `${BASE_PROMPT}\n\n${availableToolsText}`.trim();
    
    // Добавляем сообщение пользователя в историю
    addToHistory('user', query);
    
    // Формируем сообщения с историей разговора
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory
    ];
    
    try {
        if (useTools) {
            await askLM(messages, true);
            log('INFO', 'INDEX', 'tools_used', `Query processed with tools`);
        } else {
            await askLM(messages, false);
        }
const response = await handleRequest(query, global, askLM, SYSTEM_PROMPT, null, conversationHistory);
        if (!response) {
            console.log('\x1b[33mNo response from AI.\x1b[0m');
            return;
        }
        log('INFO', 'INDEX', 'response', `Response length: ${JSON.stringify(response).length}`);
        let text = typeof response === 'string' ? response : Array.isArray(response) ? response.map(r => r.content || '').join('\n').trim() : (typeof response === 'object' && response !== null ? JSON.stringify(response, null, 2) : '');
        if (text.length > 3500) {
            text = text.substring(0, 3000) + '\n...';
        }
        
        // Добавляем ответ ассистента в историю
        addToHistory('assistant', text);
        
        process.stdout.write('\x1b[32m' + text.trim() + '\x1b[0m');
    } catch (error) {
        log('ERROR', 'INDEX', 'exception', error.message);
        console.error(`\x1b[31mError:\x1b[0m ${error.message}`);
    }
}

// Экспорт функций для внешних модулей
export { handleQuery, addToHistory, clearHistory, getHistory, conversationHistory };

// Пар��инг аргументов командной строки
const rawArgs = process.argv.slice(2);
let mode = 'chat'; // По умолчанию - терминальный чат

if (rawArgs.length > 0) {
    if (rawArgs[0] === '--vk') {
        mode = 'vk';
    } else if (rawArgs[0] === '--chat') {
        mode = 'chat';
    } else if (rawArgs[0] === '--query' && rawArgs[1]) {
        // Режим одиночного запроса
        const query = rawArgs.slice(1).join(' ');
        console.log('\n=== QUERY MODE ===');
        log('INFO', 'INDEX', 'query_mode', `Query mode: ${query}`);
await handleQuery(query, true);
        await closeLogger();
        process.exit(0);
    } else {
        // Если не начинается с --, считаем это запросом
        const query = rawArgs.join(' ');
        console.log('\n=== QUERY MODE ===');
log('INFO', 'INDEX', 'query_mode', `Query mode: ${query}`);
        await handleQuery(query, true);
        await closeLogger();
        process.exit(0);
    }
}

// Заголовок
console.log('\x1b[36m\x1b[1m===============================================\x1b[0m');
console.log('         VK ASSISTANT - AI CHAT BOT            ');
console.log(`              User ID: ${USER_ID}                `);
console.log('\x1b[36mL===============================================-\x1b[0m\n');

// Инициализация и запуск в зависимости от режима
if (mode === 'vk') {
    console.log('\x1b[33m=== VK BOT MODE ===\x1b[0m');
    
    const initialized = vkBot.initVkBot(handleQuery);
    if (!initialized) {
        console.error('\x1b[31mFailed to initialize VK bot. Check .env file!\x1b[0m');
        process.exit(1);
    }
    
    await vkBot.startVkBot();
    
} else {
    // Терминальный чат через terminal-chat.mjs
    console.log('\x1b[33m=== TERMINAL CHAT MODE ===\x1b[0m');
    
    terminalChat.initTerminalChat(handleQuery);
    await terminalChat.startChat();
}
