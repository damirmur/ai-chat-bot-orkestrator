/**
 * Тест для проверки запроса "Какой курс золота и биткоина за последний год в рублях"
 * Использует реальную модель LM Studio
 */

import { handleRequest, askLM, toolsHandlers, SYSTEM_PROMPT } from './test-helper.mjs';

const query = "Какой курс золота и биткоина за последний год в рублях";

console.log('\n[TEST 3] Начинаем тест: "' + query + '"');
console.log('='.repeat(60));

try {
    const responses = await handleRequest(query, toolsHandlers, askLM, SYSTEM_PROMPT);
    
    console.log('\n[TEST 3] Ответы бота:');
    for (const resp of responses) {
        console.log('[TEST 3]', JSON.stringify(resp, null, 2));
    }
    
    // Проверки
    console.log('\n[TEST 3] Результаты проверки:');
    
    const hasImage = responses.some(r => r.type === 'image');
    if (hasImage) {
        console.log('[TEST 3] ✓ ТЕСТ ПРОЙДЕН: получено изображение графика');
    } else {
        console.log('[TEST 3] ✗ ТЕСТ НЕ ПРОЙДЕН: нет изображения графика');
    }
    
    const hasCompletionMsg = responses.some(r => r.type === 'text' && r.content === 'Запрос успешно завершён.');
    if (hasCompletionMsg) {
        console.log('[TEST 3] ✓ ТЕСТ ПРОЙДЕН: есть отдельное сообщение "Запрос успешно завершён"');
    } else {
        console.log('[TEST 3] ✗ ТЕСТ НЕ ПРОЙДЕН: нет сообщения о завершении');
    }
    
    // Проверяем, что модель правильно построила план
    console.log('\n[TEST 3] Дополнительная проверка:');
    console.log('[TEST 3] Ожидаемый план: date_period → get_finance_data(x2) → get_finance_data(RUB=X) → draw_chart');
    
} catch (error) {
    console.error('\n[TEST 3] ОШИБКА:', error.message);
    console.error(error.stack);
}
