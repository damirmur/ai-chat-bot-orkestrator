import { createInterface } from 'node:readline';
import { log, logColor } from '../logger.mjs';

let rl = null;
let handleQueryFn = null;
let isRunning = false;

/**
 * Инициализирует терминальный чат
 * @param {Function} handleQuery - функция обработки запросов
 */
export function initTerminalChat(handleQuery) {
    handleQueryFn = handleQuery;
    rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\x1b[36m> \x1b[0m'
    });
    
    rl.on('line', async (input) => {
        await processInput(input);
    });
    
    process.on('SIGINT', () => {
        logColor('INFO', 'TERMINAL', 'shutdown', 'Received SIGINT, shutting down...', 'success');
        console.log('\n\x1b[33m' + '='.repeat(50) + '\x1b[0m');
    });
    
    process.on('SIGTERM', () => {
        logColor('INFO', 'TERMINAL', 'shutdown', 'Received SIGTERM, shutting down...', 'success');
        console.log('\n\x1b[33m' + '='.repeat(50) + '\x1b[0m');
    });
    
    rl.on('close', () => {
        stopChat();
    });
}

/**
 * Запускает интерактивный чат
 */
export async function startChat() {
    if (!rl || !handleQueryFn) {
        log('ERROR', 'TERMINAL', 'not_initialized', 'Terminal chat not initialized');
        console.error('\x1b[31mTerminal chat not initialized!\x1b[0m');
        return;
    }
    
    isRunning = true;
    rl.prompt();
}

/**
 * Завершает чат и очищает ресурсы
 */
export function stopChat() {
    if (!isRunning) return;
    isRunning = false;
    log('INFO', 'TERMINAL', 'chat_stopped', 'Chat session stopped');
    rl.close();
}

/**
 * Обрабатывает ввод пользователя
 */
async function processInput(input) {
    if (!input.trim()) {
        rl.prompt();
        return;
    }
    
    log('DEBUG', 'TERMINAL', 'user_input', `User input: ${input}`);
    
    // Check for quit/exit commands (with or without / prefix)
    const normalizedInput = input.toLowerCase().trim();
    if (normalizedInput === 'quit' || normalizedInput === 'exit' || 
        normalizedInput.startsWith('/quit') || normalizedInput.startsWith('/exit')) {
        console.log('\n\x1b[33mGoodbye! Chat session ended.\x1b[0m');
        isRunning = false;
        rl.close();
        return;
    }
    
    if (input.startsWith('/')) {
        if (input.toLowerCase() === '/help') {
            printHelp();
            rl.prompt();
            return;
        }
        
        const cmd = input.substring(1).trim();
        log('INFO', 'TERMINAL', 'command', `Command: ${cmd}`);
        await handleQueryFn(cmd, true);
    } else {
        await handleQueryFn(input, true);
    }
    
    rl.prompt();
}

/**
 * Выводит справку по командам
 */
function printHelp() {
    console.log('\n=== AVAILABLE COMMANDS ===');
    console.log('  /weather <city>  - Get weather info');
    console.log('  /time            - Show current time');
    console.log('  /chart <prompt>  - Create chart');
    console.log('  /table <prompt>  - Generate table');
    console.log('Commands starting with / use tools + AI');
    console.log('Type "quit" to exit');
}

/**
 * Обрабатывает одиночный запрос
 */
export async function handleSingleQuery(query) {
    if (!handleQueryFn) {
        log('ERROR', 'TERMINAL', 'not_initialized', 'Terminal chat not initialized');
        return;
    }
    
    log('INFO', 'TERMINAL', 'query_mode', `Query mode started with: ${query}`);
    await handleQueryFn(query, true);
}

/**
 * Проверяет, запущен ли чат
 */
export function isChatRunning() {
    return isRunning;
}
