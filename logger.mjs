import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_DATE = new Date().toISOString().replace(/[:.]/g, '-').replace(/\.\d{3}/, '');
const LOG_FILE = path.join(LOG_DIR, `${LOG_DATE}.log`);

fs.mkdirSync(LOG_DIR, { recursive: true });

function format(level, module, event, message) {
    const ts = new Date().toISOString();
    const msg = typeof message === 'object' ? JSON.stringify(message) : String(message);
    return `[${ts}] [${level}] [${module}] [${event}] [${msg}]`;
}

const COLORS = {
    info: '\x1b[36m',     // cyan
    warn: '\x1b[93m',     // yellow  
    error: '\x1b[31m',    // red
    debug: '\x1b[90m',    // black/bright
    success: '\x1b[32m',  // green
    reset: '\x1b[0m'
};

const PEER_PREFIX = {
    'VK': '[\x1b[36mVK\x1b[0m]',       // cyan for VK bot (shortened)
    'VK-BOT': '[\x1b[36mVK-BOT\x1b[0m]',      // cyan for VK bot  
    'TERMINAL': '[\x1b[32mTERMINAL\x1b[0m]'    // green for terminal chat
};

let logStream = null;

async function ensureLogger() {
    if (!logStream) {
        try {
            logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
            await new Promise((resolve, reject) => {
                logStream.once('open', resolve);
                logStream.once('error', reject);
            });
        } catch (e) {
            console.error(`Failed to create logger: ${e.message}`);
        }
    }
}

function writeLog(level, module, event, message, isError = false) {
    return ensureLogger().then(() => {
        const formattedMessage = format(level, module, event, message);
        
        if (isError) {
            // Errors to both console and file with colors
            const peerId = PEER_PREFIX[module] || '';
            logStream.write(`${peerId} ${COLORS.error}${formattedMessage}${COLORS.reset}\n`);
            console.error(`\x1b[${module === 'TERMINAL' ? '32' : (level === 'ERROR' ? '31' : '36')}]${peerId}${formattedMessage}\x1b[0m`);
        } else {
            // Everything else only to file without colors
            logStream.write(formattedMessage + '\n');
        }
    });
}

function writeLogColor(level, module, event, message, colorKey, isError = false) {
    return ensureLogger().then(() => {
        const color = COLORS[colorKey] || '';
        const peerId = PEER_PREFIX[module] || '';
        const formattedMsg = format(level, module, event, message);
        
        if (isError) {
            // Errors to both console and file with colors
            const escapeCode = module === 'TERMINAL' ? 32 : (color || '');
            logStream.write(`${peerId} ${color}${formattedMsg}${COLORS.reset}\n`);
            console.error(`\x1b[${escapeCode}]${peerId}${formattedMsg}\x1b[0m`);
        } else {
            // Everything else only to file without colors
            logStream.write(`${peerId} ${formattedMsg}\n`);
        }
    });
}

export async function log(level, module, event, message) {
    await writeLog(level, module, event, message, false);
}

export async function logColor(level, module, event, message, colorKey) {
    await writeLogColor(level, module, event, message, colorKey, false);
}

export async function error(module, event, message) {
    await writeLog('ERROR', module, event, message, true);
}

export async function logWithColors(level, module, event, message, colorKey) {
    await writeLogColor(level, module, event, message, colorKey, false);
}

export function getLogFile() {
    return LOG_FILE;
}

/**
 * Flush and close the log stream gracefully
 * Call this before process.exit() to avoid libuv assertion errors
 */
export async function closeLogger() {
    if (!logStream) return Promise.resolve();
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            try {
                logStream.destroy();
            } catch (e) {}
            resolve();
        }, 1000);
        
        if (logStream && !logStream.destroyed) {
            logStream._undrained = false;
            logStream.end(() => {
                clearTimeout(timeout);
                setTimeout(resolve, 50);
            });
            logStream.once('error', reject);
        } else {
            clearTimeout(timeout);
            resolve();
        }
    });
}

/**
 * Graceful shutdown handler - flushes logs before exit
 */
export async function gracefulShutdown(exitCode = 0) {
    await closeLogger();
    process.exit(exitCode);
}
