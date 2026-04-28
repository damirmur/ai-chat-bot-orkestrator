import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const definition = {
    type: "function",
    function: {
        name: "draw_chart",
        description: "Визуализировать данные в виде столбчатой диаграммы",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string" },
                labels: { type: "array", items: { type: "string" } },
                values: { type: "array", items: { type: "number" } }
            },
            required: ["title", "labels", "values"]
        }
    }
};

function generateSvg(title, labels, values) {
    const width = 600;
    const height = 400;
    const padding = 60;
    const barWidth = (width - padding * 2) / values.length;
    const maxValue = Math.max(...values);
    const chartHeight = height - padding * 2;
    
    let bars = '';
    values.forEach((val, i) => {
        const barHeight = (val / maxValue) * chartHeight;
        const x = padding + i * barWidth + 5;
        const y = height - padding - barHeight;
        const w = barWidth - 10;
        
        bars += `<rect x="${x}" y="${y}" width="${w}" height="${barHeight}" fill="#4A90D9" rx="2"/>`;
    });
    
    let labelsSvg = '';
    labels.forEach((label, i) => {
        const x = padding + i * barWidth + barWidth / 2;
        const y = height - padding + 15;
        labelsSvg += `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="#666">${label}</text>`;
    });
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="white"/>
    <text x="${width/2}" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${title}</text>
    <line x1="${padding}" y1="${height-padding}" x2="${width-padding}" y2="${height-padding}" stroke="#ccc" stroke-width="1"/>
    ${bars}
    ${labelsSvg}
</svg>`;
}

export async function handler(args) {
    const title = args.title || "Data Chart";
    const labels = args.labels || [];
    const values = args.values || [];
    
    if (values.length === 0) {
        return JSON.stringify({ error: "Нет данных для графика" });
    }
    
    const svg = generateSvg(title, labels, values);
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const base64 = pngBuffer.toString('base64');
    
    return JSON.stringify({
        image: `data:image/png;base64,${base64}`,
        title: title
    });
}