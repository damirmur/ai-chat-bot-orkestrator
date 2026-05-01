import { log, logColor } from '../logger.mjs';

let handleQueryFn = null;
let isRunning = false;
let pollTimer = null;
let ts = null;

/**
 * Конфигурация VK бота
 */
const VK_CONFIG = {
    token: process.env.VK_TOKEN,
    userId: Number(process.env.USER_ID),
    groupId: Number(process.env.GROUP_ID),
    chatPeerId: Number(process.env.CHAT_PEER_ID),
    apiVersion: process.env.API_VERSION || '5.199',
    wait: 25 // время ожидания long polling
};

/**
 * Инициализирует VK бота
 * @param {Function} handleQuery - функция обработки запросов
 */
export function initVkBot(handleQuery) {
    handleQueryFn = handleQuery;
    
    // Проверка конфигурации
    if (!VK_CONFIG.token) {
        log('ERROR', 'VK', 'no_token', 'VK_TOKEN not configured');
        return false;
    }
    
    if (!VK_CONFIG.groupId) {
        log('ERROR', 'VK', 'no_group_id', 'GROUP_ID not configured');
        return false;
    }
    
    logColor('INFO', 'VK', 'initialized', `Group ID: ${VK_CONFIG.groupId}, User ID: ${VK_CONFIG.userId}`, 'success');
    return true;
}

/**
 * Запускает VK бота (long polling)
 */
export async function startVkBot() {
    if (!handleQueryFn) {
        log('ERROR', 'VK', 'not_initialized', 'VK bot not initialized');
        return;
    }
    
    isRunning = true;
    logColor('INFO', 'VK', 'start', 'Starting VK bot...', 'success');
    
    await poll();
}

/**
 * Останавливает VK бота
 */
export function stopVkBot() {
    isRunning = false;
    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
    logColor('INFO', 'VK', 'stopped', 'VK bot stopped', 'success');
}

/**
 * Long polling
 */
async function poll() {
    if (!isRunning) return;
    
    try {
        const params = {
            group_id: VK_CONFIG.groupId,
            wait: VK_CONFIG.wait,
            mode: 2 // receive messages
        };
        
        if (ts) {
            params.ts = ts;
        }
        
        const response = await vkApiCall('groups.getLongPollServer', params);
        
        if (response) {
            ts = response.ts;
            
            // Загружаем события
            await fetchEvents(response.server, response.key, ts);
        }
    } catch (error) {
        log('ERROR', 'VK', 'poll_error', error.message);
    }
    
    // Продолжаем опрос
    pollTimer = setTimeout(poll, VK_CONFIG.wait * 1000);
}

/**
 * Загружает события с Long Poll сервера
 */
async function fetchEvents(server, key, ts) {
    const url = `https://${server}?act=a_check&key=${key}&ts=${ts}&wait=${VK_CONFIG.wait}&mode=2&version=${VK_CONFIG.apiVersion}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.failed) {
            log('WARN', 'VK', 'poll_failed', `Failed: ${data.failed}, retrying...`);
            ts = null; // Сбросить ts и переподключиться
            return;
        }
        
        if (data.ts) {
            ts = data.ts;
        }
        
        // Обработка событий
        if (data.updates && Array.isArray(data.updates)) {
            for (const update of data.updates) {
                await processUpdate(update);
            }
        }
    } catch (error) {
        log('ERROR', 'VK', 'fetch_error', error.message);
    }
}

/**
 * Обрабатывает событие
 */
async function processUpdate(update) {
    const [type, object, eventId] = update;
    
    // type = 4 -> новое сообщение
    if (type === 4) {
        const message = object;
        
        // Проверяем, что сообщение от нужного пользователя или из нужного чата
        const fromId = message.from || message.user_id;
        
        // Разрешаем только от USER_ID или из CHAT_PEER_ID
        if (fromId !== VK_CONFIG.userId && message.peer_id !== VK_CONFIG.chatPeerId) {
            log('DEBUG', 'VK', 'ignored', `Message from ${fromId} ignored`);
            return;
        }
        
        // Проверяем, что не наше собственное сообщение
        if (message.out === 1) {
            log('DEBUG', 'VK', 'own_message', 'Ignoring own message');
            return;
        }
        
        log('INFO', 'VK', 'new_message', `From: ${fromId}, Text: ${message.text?.substring(0, 50)}`);
        
        // Отправляем на обработку
        await handleQueryFn(message.text, true);
    }
}

/**
 * Вызов VK API
 * @param {string} method - метод API
 * @param {object} params - параметры
 */
export async function vkApiCall(method, params = {}) {
    const url = 'https://api.vk.com/method/' + method;
    
    const requestParams = {
        access_token: VK_CONFIG.token,
        v: VK_CONFIG.apiVersion,
        ...params
    };
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(requestParams).toString()
        });
        
        const data = await response.json();
        
        if (data.error) {
            log('ERROR', 'VK', 'api_error', `Error ${data.error.error_code}: ${data.error.error_msg}`);
            throw new Error(data.error.error_msg);
        }
        
        return data.response;
    } catch (error) {
        log('ERROR', 'VK', 'call_error', error.message);
        throw error;
    }
}

/**
 * Отправляет сообщение в VK
 * @param {string|number} peerId - ID получателя
 * @param {string} text - текст сообщения
 */
export async function sendMessage(peerId, text) {
    const recipient = peerId || VK_CONFIG.chatPeerId;
    
    log('INFO', 'VK', 'send', `Sending to ${recipient}: ${text.substring(0, 30)}...`);
    
    return vkApiCall('messages.send', {
        peer_id: recipient,
        message: text,
        random_id: Date.now()
    });
}

/**
 * Проверяет, запущен ли бот
 */
export function isVkBotRunning() {
    return isRunning;
}

/**
 * Получает конфигурацию
 */
export function getVkConfig() {
    return { ...VK_CONFIG };
}
