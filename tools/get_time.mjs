import { execSync } from 'child_process';

export const definition = {
    type: "function",
    function: {
        name: "get_system_time",
        description: "Получить системное время и дату"
    }
};

export async function handler(args) {
    try {
        const time = execSync(`powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`).toString().trim();
        // Промежуточный результат (не финальный ответ)
        return JSON.stringify({ intermediate: true, text: time });
    } catch (e) {
        return JSON.stringify({ error: `Ошибка получения времени: ${e.message}` });
    }
}
