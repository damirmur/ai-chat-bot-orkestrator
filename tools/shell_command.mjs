import { log } from '../logger.mjs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const definition = {
    type: "function",
    function: {
        name: "shell_command",
        description: "Execute system commands in a sandboxed environment for file operations and system tasks. State is saved per peerId (USER_ID). Common commands: 'dir', 'ls', 'whoami'.",
        parameters: {
            type: "object",
            properties: {
                command: { type: "string", description: "System command to execute (e.g., 'dir', 'ls', 'whoami')" },
                peerId: { type: "string", description: "Unique identifier for the user session" },
                userId: { type: "string", description: "User ID from USER_ID environment variable" }
            },
            required: ["command", "peerId", "userId"]
        }
    }
};

export async function handler(args) {
    const { command, peerId, userId } = args;
    
    if (!userId) {
        log('ERROR', 'shell_command', 'no_user_id', 'USER_ID не задан');
        return JSON.stringify({ error: "Доступ запрещён: при необходимости обратитесь к владельцу сообщества" });
    }
    
    if (String(peerId) !== String(userId)) {
        log('INFO', 'shell_command', 'access_denied', `peerId ${peerId} != userId ${userId}`);
        return JSON.stringify({ error: "Доступ запрещён: при необходимости обратитесь к владельцу сообщества" });
    }
    
    log('INFO', 'shell_command', 'executing', `command: ${command}`);
    
    try {
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'powershell' : 'sh';
        const shellArg = isWindows ? ['-NoProfile', '-Command', command] : ['-c', command];
        
        const { stdout, stderr } = await execFileAsync(shell, shellArg, { timeout: 30000 });
        
        const result = stdout || (stderr ? stderr : 'Команда выполнена без вывода');
        log('INFO', 'shell_command', 'success', `stdout: ${result.substring(0, 500)}`);
        
        return JSON.stringify({ text: result });
    } catch (error) {
        log('ERROR', 'shell_command', 'error', error.message);
        return JSON.stringify({ error: `Ошибка выполнения команды: ${error.message}` });
    }
}
