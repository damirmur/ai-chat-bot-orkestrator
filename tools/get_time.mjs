import { execSync } from 'child_process';

export const definition = {
    type: "function",
    function: {
        name: "get_system_time",
        description: "Получить системное время и дату"
    }
};

export async function handler(args) {
    return execSync(`powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`).toString().trim();
}
