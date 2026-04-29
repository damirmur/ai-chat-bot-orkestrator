/**
 * Тест для проверки запроса "Какой курс эфира за последний год в долларах"
 * Использует реальную модель LM Studio
 */

import { handleRequest, askLM, toolsHandlers, SYSTEM_PROMPT } from './test-helper.mjs';

const query = "Какой курс эфира за последний год в долларах";

console.log('\n[TEST 4] Начинаем тест: "' + query + '"');
console.log('='.repeat(60));

try {
    const responses = await handleRequest(query, toolsHandlers, askLM, SYSTEM_PROMPT);
    
    console.log('\n[TEST 4] Ответы бота:');
    for (const resp of responses) {
        console.log('[TEST 4]', JSON.stringify(resp, null, 2));
    }
    
    // Проверки
    console.log('\n[TEST 4] Результаты проверки:');
    
    const hasImage = responses.some(r => r.type === 'image');
    if (hasImage) {
        console.log('[TEST 4] ✓ ТЕСТ ПРОЙДЕН: получено изображение графика');
    } else {
        console.log('[TEST 4] ✗ ТЕСТ НЕ ПРОЙДЕН: нет изображения графика');
    }
    
    const hasCompletionMsg = responses.some(r => r.type === 'text' && r.content === 'Запрос успешно завершён.');
    if (hasCompletionMsg) {
        console.log('[TEST 4] ✓ ТЕСТ ПРОЙДЕН: есть отдельное сообщение "Запрос успешно завершён"');
    } else {
        console.log('[TEST 4] ✗ ТЕСТ НЕ ПРОЙДЕН: нет сообщения о завершении');
    }
    
    // Дополнительная проверка: запрос в долларах - конвертация в рубли НЕ требуется
    console.log('\n[TEST 4] Дополнительная проверка:');
    console.log('[TEST 4] Запрос в долларах - конвертация в рубли НЕ требуется');
    console.log('[TEST 4] Ожидаемый заголовок графика: "Эфир, USD"');
    
} catch (error) {
    console.error('\n[TEST 4] ОШИБКА:', error.message);
    console.error(error.stack);
}
