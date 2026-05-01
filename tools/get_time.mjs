import { log } from '../logger.mjs';
import * as temporal from 'temporal-polyfill';

const Temporal = temporal.Temporal;

export const definition = {
    type: "function",
    function: {
        name: "get_system_time",
        description: "Получить системное время и дату",
        parameters: {}
    }
};

export async function handler(args) {
    try {
        const time = Temporal.Now.instant().toString();
        log('INFO', 'get_time', 'result', time);
        return JSON.stringify({ text: time });
    } catch (e) {
        log('ERROR', 'get_time', 'error', e.message);
        return JSON.stringify({ error: `Ошибка получения времени: ${e.message}` });
    }
}
