import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "date_period",
        description: "Generate date arrays for periods. period='2025' (year), '2025-03' (month), '2025-03-15' (day). range='1y', '5y', '1mo' for relative ranges from today.",
        parameters: {
            type: "object",
            properties: {
                period: { type: "string", description: "Date period format: YYYY, YYYY-MM, or YYYY-MM-DD" },
                range: { type: "string", enum: ["1mo", "1y", "5y"], description: "Relative range from current date (1 month, 1 year, or 5 years)" },
                target: { type: "string", enum: ["chart", "table"], description: "Output format for visualization" }
            }
        }
    }
};

function formatDateISO(date) {
    return date.toISOString().split('T')[0];
}

function formatLabel(date, periodType) {
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    if (periodType === 'year') {
        return months[date.getMonth()] + ' ' + date.getFullYear();
    } else if (periodType === 'month') {
        return date.getDate() + ' ' + months[date.getMonth()];
    } else {
        return date.getHours() + ':00';
    }
}

export async function handler(args) {
    const { period, range, target } = args;
    
    const now = new Date();
    const today = formatDateISO(now);
    
    log('INFO', 'date_period', 'input', JSON.stringify({ period, range, target }));
    
    let labels = [];
    let startDate, endDate;
    let periodType = 'year';
    
    if (period) {
        if (period.length === 4) {
            startDate = new Date(period + '-01-01');
            endDate = new Date(period + '-12-31');
            periodType = 'year';
            let curr = new Date(startDate);
            while (curr <= endDate) {
                labels.push(formatLabel(curr, periodType));
                curr.setMonth(curr.getMonth() + 1);
            }
        } else if (period.length === 7) {
            startDate = new Date(period + '-01');
            const y = parseInt(period.split('-')[0]);
            const m = parseInt(period.split('-')[1]) - 1;
            endDate = new Date(y, m + 1, 0);
            periodType = 'month';
            let curr = new Date(startDate);
            while (curr <= endDate) {
                labels.push(formatLabel(curr, periodType));
                curr.setDate(curr.getDate() + 1);
            }
        } else if (period.length === 10) {
            startDate = new Date(period + 'T00:00:00');
            endDate = new Date(period + 'T23:59:59');
            periodType = 'day';
            let curr = new Date(startDate);
            while (curr <= endDate) {
                labels.push(formatLabel(curr, periodType));
                curr.setHours(curr.getHours() + 1);
            }
        }
    } else if (range) {
        if (range === '1y') {
            startDate = new Date(now);
            startDate.setFullYear(startDate.getFullYear() - 1);
            periodType = 'year';
            let curr = new Date(startDate);
            while (curr <= now) {
                labels.push(formatLabel(curr, periodType));
                curr.setMonth(curr.getMonth() + 1);
            }
        } else if (range === '5y') {
            startDate = new Date(now);
            startDate.setFullYear(startDate.getFullYear() - 5);
            periodType = 'year';
            let curr = new Date(startDate);
            while (curr <= now) {
                labels.push(formatLabel(curr, periodType));
                curr.setMonth(curr.getMonth() + 1);
            }
        } else if (range === '1mo') {
            startDate = new Date(now);
            startDate.setMonth(startDate.getMonth() - 1);
            periodType = 'month';
            let curr = new Date(startDate);
            while (curr <= now) {
                labels.push(formatLabel(curr, periodType));
                curr.setDate(curr.getDate() + 1);
            }
        }
    } else {
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        periodType = 'year';
        let curr = new Date(startDate);
        while (curr <= now) {
            labels.push(formatLabel(curr, periodType));
            curr.setMonth(curr.getMonth() + 1);
        }
    }
    
    log('INFO', 'date_period', 'result', `periodType=${periodType}, labels=${labels.length}, start=${formatDateISO(startDate)}, end=${formatDateISO(endDate || now)}`);
    
    return JSON.stringify({
        intermediate: true,
        labels: labels,
        startDate: formatDateISO(startDate),
        endDate: formatDateISO(endDate || now),
        target: target || 'chart'
    });
}
