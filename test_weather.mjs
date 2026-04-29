/**
 * Тест для проверки запроса "Какая погода сейчас в Вашингтоне"
 * Использует реальную модель LM Studio
 */

import { handleRequest, askLM, toolsHandlers, SYSTEM_PROMPT } from './test-helper.mjs';

const query = "Какая погода сейчас в Вашингтоне";

console.log('\n[TEST 2] Начинаем тест: "' + query + '"');
console.log('='.repeat(60));

try {
    const responses = await handleRequest(query, toolsHandlers, askLM, SYSTEM_PROMPT);
    
    console.log('\n[TEST 2] Ответы бота:');
    for (const resp of responses) {
        console.log('[TEST 2]', JSON.stringify(resp, null, 2));
    }
    
    // Проверки
    console.log('\n[TEST 2] Результаты проверки:');
    
    const hasText = responses.some(r => r.type === 'text' && r.content && !r.content.includes('Запрос успешно завершён'));
    if (hasText) {
        console.log('[TEST 2] ✓ ТЕСТ ПРОЙДЕН: получен текстовый ответ');
    } else {
        console.log('[TEST 2] ✗ ТЕСТ НЕ ПРОЙДЕН: нет текстового ответа');
    }
    
    const hasWashington = responses.some(r => r.content && r.content.includes('Вашингтон'));
    if (hasWashington) {
        console.log('[TEST 2] ✓ ТЕСТ ПРОЙДЕН: в ответе есть информация о Вашингтоне');
    } else {
        console.log('[TEST 2] ✗ ТЕСТ НЕ ПРОЙДЕН: нет информации о Вашингтоне');
    }
    
    const hasDate = responses.some(r => r.content && r.content.match(/\d{1,2} \w+ \d{4}/));
    if (hasDate) {
        console.log('[TEST 2] ✓ ТЕСТ ПРОЙДЕН: есть конкретная дата (не "сейчас")');
    } else {
        console.log('[TEST 2] ✗ ТЕСТ НЕ ПРОЙДЕН: нет конкретной даты');
    }
    
} catch (error) {
    console.error('\n[TEST 2] ОШИБКА:', error.message);
    console.error(error.stack);
}
