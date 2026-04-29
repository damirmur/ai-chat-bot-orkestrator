/**
 * Тест для проверки запроса "какой курс доллара на сегодня"
 * Использует реальную модель LM Studio
 */

import { handleRequest, askLM, toolsHandlers, SYSTEM_PROMPT } from './test-helper.mjs';

const query = "какой курс доллара на сегодня";

console.log('\n[TEST 1] Начинаем тест: "' + query + '"');
console.log('='.repeat(60));

try {
    const responses = await handleRequest(query, toolsHandlers, askLM, SYSTEM_PROMPT);
    
    console.log('\n[TEST 1] Ответы бота:');
    for (const resp of responses) {
        console.log('[TEST 1]', JSON.stringify(resp, null, 2));
    }
    
    // Проверки
    console.log('\n[TEST 1] Результаты проверки:');
    
    const hasText = responses.some(r => r.type === 'text' && r.content && !r.content.includes('Запрос успешно завершён'));
    if (hasText) {
        console.log('[TEST 1] ✓ ТЕСТ ПРОЙДЕН: получен текстовый ответ');
    } else {
        console.log('[TEST 1] ✗ ТЕСТ НЕ ПРОЙДЕН: нет текстового ответа');
    }
    
    const hasDate = responses.some(r => r.content && r.content.includes('на ') && (r.content.includes('год') || r.content.match(/\d{4}/)));
    if (hasDate) {
        console.log('[TEST 1] ✓ ТЕСТ ПРОЙДЕН: в ответе есть дата');
    } else {
        console.log('[TEST 1] ✗ ТЕСТ НЕ ПРОЙДЕН: нет даты в ответе');
    }
    
    const hasKopeks = responses.some(r => r.content && r.content.match(/\d+,\d{2}/));
    if (hasKopeks) {
        console.log('[TEST 1] ✓ ТЕСТ ПРОЙДЕН: копейки отображаются');
    } else {
        console.log('[TEST 1] ✗ ТЕСТ НЕ ПРОЙДЕН: копейки не отображаются');
    }
    
} catch (error) {
    console.error('\n[TEST 1] ОШИБКА:', error.message);
    console.error(error.stack);
}
