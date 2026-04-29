import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const definition = {
    type: "function",
    function: {
        name: "draw_chart",
        description: "Визуализировать данные в виде столбчатой диаграммы. Принимает либо (labels, values, legend), либо sourceData с контрактом данных.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "Заголовок графика (включай валюту, например: Золото, USD)" },
                labels: { type: "array", items: { type: "string" }, description: "Подписи по оси X (даты)" },
                values: { type: "array", description: "Массив массивов для нескольких серий: [[1,2,3],[4,5,6]]" },
                legend: { type: "array", items: { type: "string" }, description: "Названия серий для легенды" },
                currency: { type: "string", description: "Валюта: USD, RUB" },
                sourceData: { type: "array", description: "Данные от предыдущих шагов (контракт данных)" }
            },
            required: ["title"]
        }
    }
};

function generateSvg(title, labels, values, currency = 'USD', legend = null) {
    const width = 800;
    const height = 500;
    const padding = 70;
    
    // values может быть массивом массивов
    const isMultiSeries = Array.isArray(values[0]);
    const seriesCount = isMultiSeries ? values.length : 1;
    const seriesValues = isMultiSeries ? values : [values];
    
    // Находим max для всех серий
    const allVals = seriesValues.flat();
    const maxValue = Math.max(...allVals);
    const minValue = Math.min(...allVals);
    const chartHeight = height - padding * 2;
    
    // Цвета для разных серий
    const colors = ['#4A90D9', '#E67E22', '#27AE60', '#9B59B6', '#E74C3C', '#3498DB'];
    
    const currencySymbol = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : '';
    
    // Min/Max values
    const minLabel = `${currencySymbol}${Math.round(minValue).toLocaleString('ru-RU')}`;
    const maxLabel = `${currencySymbol}${Math.round(maxValue).toLocaleString('ru-RU')}`;
    
    // Bars and value labels
    let bars = '';
    const barWidth = (width - padding * 2) / labels.length;
    const groupWidth = barWidth / seriesCount;
    let valueLabels = '';
    seriesValues.forEach((series, si) => {
        const color = colors[si % colors.length];
        series.forEach((val, i) => {
            const barHeight = (val / maxValue) * chartHeight;
            const x = padding + i * barWidth + si * groupWidth + 2;
            const y = height - padding - barHeight;
            const w = groupWidth - 4;
            
            bars += `<rect x="${x}" y="${y}" width="${w}" height="${barHeight}" fill="${color}" rx="1"/>`;
            
            // Value label on top of bar
            const valLabel = `${currencySymbol}${Math.round(val).toLocaleString('ru-RU')}`;
            valueLabels += `<text x="${x + w/2}" y="${y - 8}" text-anchor="middle" font-size="9" fill="#333" font-weight="bold">${valLabel}</text>`;
        });
    });
    
    // Легенда
    let legendSvg = '';
    if (legend && legend.length > 0) {
        const legendY = 65;
        let legendX = padding;
        legend.forEach((name, i) => {
            const color = colors[i % colors.length];
            legendSvg += `<rect x="${legendX}" y="${legendY}" width="12" height="12" fill="${color}"/>`;
            legendSvg += `<text x="${legendX + 16}" y="${legendY + 10}" font-size="11" fill="#333">${name}</text>`;
            legendX += 100;
        });
    }
    
    // X-axis labels (dates) - показываем только несколько
    let labelsSvg = '';
    const step = Math.ceil(labels.length / 10); // максимум 10 подписей
    labels.forEach((label, i) => {
        if (i % step === 0) {
            const x = padding + i * barWidth + barWidth / 2;
            const y = height - padding + 20;
            labelsSvg += `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#666">${label}</text>`;
        }
    });
    
    // Y-axis min/max
    const yAxisLabels = `
        <text x="${padding - 10}" y="${padding}" text-anchor="end" font-size="10" fill="#666">${maxLabel}</text>
        <text x="${padding - 10}" y="${height - padding}" text-anchor="end" font-size="10" fill="#666">${minLabel}</text>
    `;
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="white"/>
    <text x="${width/2}" y="25" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${title}</text>
    <text x="${width/2}" y="45" text-anchor="middle" font-size="12" fill="#888">Период: ${labels[0]} - ${labels[labels.length-1]}</text>
    ${legendSvg}
    <line x1="${padding}" y1="${height-padding}" x2="${width-padding}" y2="${height-padding}" stroke="#ccc" stroke-width="1"/>
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height-padding}" stroke="#ccc" stroke-width="1"/>
    ${yAxisLabels}
    ${bars}
    ${valueLabels}
    ${labelsSvg}
</svg>`;
}

/**
 * Обработка контрактов данных из sourceData
 * Поддерживаемые типы:
 * - { type: 'time-series', labels: [...], values: [...] }
 * - { labels: [...] } (от date_period)
 * - { history: [...] } (от get_finance_data)
 */
function processSourceData(sourceData) {
    console.log(`[draw_chart] Обработка sourceData (${sourceData.length} источников)`);
    
    let labels = [];
    const allValues = [];
    const legend = [];
    let currency = null;
    let hasUsdAsset = false;
    let usdToRub = null;
    
    for (const item of sourceData) {
        // Пропускаем промежуточные результаты
        if (item.intermediate) {
            console.log(`[draw_chart] Пропускаю промежуточный результат`);
            continue;
        }
        
        // Тип данных: time-series (контракт)
        if (item.type === 'time-series') {
            if (!labels.length && item.labels) {
                labels = item.labels;
            }
            if (item.values) {
                allValues.push(item.values);
                legend.push(item.name || `Series ${allValues.length}`);
            }
            continue;
        }
        
        // Метки времени (от date_period)
        if (item.labels && Array.isArray(item.labels) && !labels.length) {
            labels = item.labels;
            console.log(`[draw_chart] Получены labels (${labels.length})`);
        }
        
        // Исторические данные (от get_finance_data)
        if (item.history && Array.isArray(item.history)) {
            const vals = item.history
                .map(d => d.price || d.close)
                .filter(v => v != null);
            
            if (vals.length > 0) {
                allValues.push(vals);
                
                const name = item.symbol || item.name || `Series ${allValues.length}`;
                legend.push(name);
                
                // Проверить, нужно ли конвертировать в рубли
                const isUsdAsset = item.symbol && (item.symbol.includes('-USD') || item.symbol.includes('=F'));
                if (isUsdAsset) {
                    hasUsdAsset = true;
                }
                
                console.log(`[draw_chart] Получены values (${vals.length}) от ${name}`);
            }
        }
        
        // Курс валют для конвертации
        if (item.price && (item.symbol === 'RUB=X' || item.symbol === 'USD/RUB')) {
            usdToRub = parseFloat(item.price);
            console.log(`[draw_chart] Курс USD/RUB: ${usdToRub}`);
        }
    }
    
    // Конвертация в рубли если нужно
    let finalValues = allValues;
    if (hasUsdAsset && usdToRub) {
        console.log(`[draw_chart] Конвертация в рубли по курсу ${usdToRub}`);
        finalValues = allValues.map(vals => vals.map(v => Math.round(v * usdToRub)));
        currency = 'RUB';
    }
    
    // Обрезка labels до минимальной длины values
    if (labels.length > 0 && finalValues.length > 0) {
        const minLen = Math.min(labels.length, ...finalValues.map(v => v.length));
        labels = labels.slice(0, minLen);
        finalValues = finalValues.map(v => v.slice(0, minLen));
    }
    
    return {
        labels,
        values: finalValues.length === 1 ? finalValues[0] : finalValues,
        legend: legend.length > 0 ? legend : null,
        currency: currency || 'USD'
    };
}

export async function handler(args) {
    const title = args.title || "Data Chart";
    let labels = args.labels || [];
    let values = args.values || [];
    let legend = args.legend || null;
    let currency = args.currency || 'USD';
    
    console.log(`[draw_chart] title: ${title}`);
    
    // Если есть sourceData — обрабатываем через контракты данных
    if (args.sourceData && Array.isArray(args.sourceData)) {
        console.log(`[draw_chart] Использую sourceData (${args.sourceData.length} источников)`);
        const processed = processSourceData(args.sourceData);
        labels = processed.labels;
        values = processed.values;
        legend = processed.legend;
        currency = processed.currency;
    }
    
    // Валидация
    if (values.length === 0) {
        return JSON.stringify({ error: "Нет данных для графика" });
    }
    
    if (labels.length === 0) {
        // Генерируем заглушки
        const len = Array.isArray(values[0]) ? values[0].length : values.length;
        labels = Array.from({ length: len }, (_, i) => `Point ${i+1}`);
    }
    
    console.log(`[draw_chart] Итог: labels=${labels.length}, values=${values.length}, legend=${legend ? legend.join(', ') : 'none'}, currency=${currency}`);
    
    const svg = generateSvg(title, labels, values, currency, legend);
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const base64 = pngBuffer.toString('base64');
    
    return JSON.stringify({
        image: `data:image/png;base64,${base64}`,
        title: title
    });
}
