// Проверка LM Studio API
fetch('http://localhost:1234/v1/models', {
    headers: { 'Authorization': 'Bearer lm-studio' }
}).then(res => res.json()).then(data => {
    console.log('LM Studio Models:', JSON.stringify(data, null, 2));
    
    if (data.data && data.data.length > 0) {
        const model = data.data[0];
        console.log(`\n✅ Модель загружена: ${model.id}`);
        process.exit(0);
    } else {
        console.log('\n⚠️ Нет моделей в LM Studio');
        process.exit(1);
    }
}).catch(err => {
    console.error('❌ Не удалось подключиться к LM Studio:', err.message);
    process.exit(1);
});
