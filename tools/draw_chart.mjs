import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "draw_chart",
        description: "Generate SVG charts for visualization (line, bar, area). Convert to base64 PNG via image_converter if needed.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "Chart title with optional currency format: BTC-USD" },
                labels: { type: "array", items: { type: "string" }, description: "X-axis data points (dates, categories)" },
                values: { type: "array", description: "Y-axis numeric data for each series: [[1,2,3],[4,5,6]]" },
                legend: { type: "array", items: { type: "string" }, description: "Data series labels (optional)" }
            },
            required: ["title"]
        }
    }
};

function generateSvg(title, labels, values, currency = 'USD', legend = null) {
    const width = 800;
    const height = 500;
    const padding = 70;
    
    const isMultiSeries = Array.isArray(values[0]);
    const seriesCount = isMultiSeries ? values.length : 1;
    const seriesValues = isMultiSeries ? values : [values];
    
    const allVals = seriesValues.flat();
    const maxValue = Math.max(...allVals);
    const minValue = Math.min(...allVals);
    const chartHeight = height - padding * 2;
    
    const colors = ['#4A90D9', '#E67E22', '#27AE60', '#9B59B6', '#E74C3C', '#3498DB'];
    const currencySymbol = currency === 'RUB' ? '₽' : '$';
    
    let bars = '';
    const barWidth = (width - padding * 2) / labels.length;
    const groupWidth = barWidth / seriesCount;
    
    for (let i = 0; i < values[0].length && i < labels.length; i++) {
        const x = padding + i * barWidth;
        const maxBarHeight = chartHeight / maxValue;
        
        seriesValues.forEach((series, si) => {
            if (i < series.length) {
                const val = series[i];
                const barHeight = val * maxBarHeight;
                const color = colors[si % colors.length];
                
                bars += `<rect x="${x + 2}" y="${height - padding - barHeight}" width="${barWidth - 4}" height="${barHeight}" fill="${color}"/>`;
            }
        });
    }
    
    let labelsSvg = '';
    const step = Math.ceil(labels.length / 10);
    labels.forEach((label, i) => {
        if (i % step === 0) {
            const x = padding + i * barWidth;
            const y = height - padding + 25;
            labelsSvg += `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#666">${label}</text>`;
        }
    });
    
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#fff"/>
    <text x="${width/2}" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${title}</text>
    <line x1="${padding}" y1="${height-padding}" x2="${width-padding}" y2="${height-padding}" stroke="#ccc"/>
    ${bars}
    ${labelsSvg}
</svg>`;
}

export async function handler(args) {
    const title = args.title || "Data Chart";
    let labels = args.labels || [];
    let values = args.values || [];
    
    log('INFO', 'draw_chart', 'generating', `title: ${title}, labels: ${labels.length}`);
    
    if (values.length === 0) {
        return JSON.stringify({ error: "Нет данных для графика" });
    }
    
    const svg = generateSvg(title, labels, values || [values[0]]);
    
    log('INFO', 'draw_chart', 'svg_ready', `SVG length: ${svg.length} chars`);
    
    return JSON.stringify({ svg: svg });
}
