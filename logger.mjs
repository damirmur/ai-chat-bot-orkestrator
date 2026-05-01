import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_DATE = new Date().toISOString().replace(/[:.]/g, '-').replace(/\.\d{3}/, '');
const LOG_FILE = path.join(LOG_DIR, `${LOG_DATE}.log`);

fs.mkdirSync(LOG_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

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
    'VK-BOT': '[\x1b[36mVK-BOT\x1b[0m]',      // cyan for VK bot
    'TERMINAL': '[\x1b[32mTERMINAL\x1b[0m]'    // green for terminal chat
};

// Logger writes to file ONLY, not to console
// Console is used directly for AI response output

console.log = function (...args) {
    const source = args[0] || '';
    const peerId = PEER_PREFIX[source] || '';
    const msgContent = args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const message = `${peerId} ${format('INFO', source, '', msgContent)}`;
    
    // Write to file only
    logStream.write(message + '\n');
};

console.warn = function (...args) {
    const source = args[0] || '';
    const peerId = PEER_PREFIX[source] || '';
    const msgContent = args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const message = `${peerId} ${format('WARN', source, '', msgContent)}`;
    
    // Write to file only
    logStream.write(message + '\n');
};

console.error = function (...args) {
    const source = args[0] || '';
    const peerId = PEER_PREFIX[source] || '';
    const msgContent = args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const message = `${peerId} ${format('ERROR', source, '', msgContent)}`;
    
    // Write to file only
    logStream.write(message + '\n');
};

export function log(level, module, event, message) {
    let formattedMessage;
    if (level === 'ERROR') {
        const peerId = PEER_PREFIX[module] || '';
        formattedMessage = `${peerId} ${format('ERROR', module, event, message)}`;
    } else {
        formattedMessage = format(level, module, event, message);
    }
    
    // Write to file only
    logStream.write(formattedMessage + '\n');
};

export function logColor(level, module, event, message, colorKey) {
    const color = COLORS[colorKey] || '';
    const peerId = PEER_PREFIX[module] || '';
    const formattedMsg = format(level, module, event, message);
    const coloredMessage = `${peerId} ${color}${formattedMsg}${COLORS.reset}`;
    
    // Write to file (without colors)
    logStream.write(coloredMessage + '\n');
};

export function getLogFile() {
    return LOG_FILE;
}

/**
 * Flush and close the log stream gracefully
 * Call this before process.exit() to avoid libuv assertion errors
 */
export async function closeLogger() {
    return new Promise((resolve) => {
        // Use a timeout as fallback in case the stream doesn't close properly
        const timeout = setTimeout(() => {
            try {
                logStream.destroy();
            } catch (e) {}
            resolve();
        }, 500);
        
        try {
            if (logStream && !logStream.destroyed) {
                logStream._undrained = false;
                logStream.end(() => {
                    clearTimeout(timeout);
                    // Give a small delay for libuv to clean up handles
                    setTimeout(() => {
                        resolve();
                    }, 50);
                });
            } else {
                clearTimeout(timeout);
                resolve();
            }
        } catch (e) {
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
