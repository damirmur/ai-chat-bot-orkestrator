import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const definition = {
    type: "function",
    function: {
        name: "draw_chart",
        description: "Визуализировать данные в виде столбчатой диаграммы. values может быть массивом массивов для нескольких серий. legend - названия серий.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "Заголовок графика (включай валюту, например: Золото, USD)" },
                labels: { type: "array", items: { type: "string" }, description: "Подписи по оси X (даты)" },
                values: { type: "array", description: "Массив массивов для нескольких серий: [[1,2,3],[4,5,6]]" },
                legend: { type: "array", items: { type: "string" }, description: "Названия серий для легенды" },
                currency: { type: "string", description: "Валюта: USD, RUB" }
            },
            required: ["title", "labels"]
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

export async function handler(args) {
    const title = args.title || "Data Chart";
    const labels = args.labels || [];
    const values = args.values || [];
    const legend = args.legend || null;
    const currency = args.currency || 'USD';
    
    console.log(`[draw_chart] labels: ${labels.length}, values: ${values.length}, legend: ${legend ? legend.join(', ') : 'none'}`);
    
    if (values.length === 0) {
        return JSON.stringify({ error: "Нет данных для графика" });
    }
    
    const svg = generateSvg(title, labels, values, currency, legend);
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const base64 = pngBuffer.toString('base64');
    
    return JSON.stringify({
        image: `data:image/png;base64,${base64}`,
        title: title
    });
}