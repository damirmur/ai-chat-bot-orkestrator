import { log } from '../logger.mjs';

export const definition = {
    type: "function",
    function: {
        name: "render_table",
        description: "Generate SVG table for data visualization in HTML format. Convert to PNG via image_converter if needed.",
        parameters: {
            type: "object",
            properties: {
                data: { 
                    type: "array", 
                    description: "Table data array (rows of values)" 
                },
                title: { type: "string", description: "Table header/title text" }
            },
            required: ["data"]
        }
    }
};

function generateSvgTable(data, title) {
    const rows = data.slice(0, 100);
    if (rows.length === 0) return '';
    
    // Auto-detect columns from first row
    const columns = Object.keys(rows[0]);
    const colWidth = 140;
    const headerHeight = 45;
    const rowHeight = 35;
    const tableWidth = columns.length * colWidth + 20;
    const titleHeight = title ? 40 : 0;
    const totalHeight = titleHeight + headerHeight + rows.length * rowHeight + 20;
    
    let html = `<svg xmlns="http://www.w3.org/2000/svg" width="${tableWidth}" height="${totalHeight}" viewBox="0 0 ${tableWidth} ${totalHeight}">`;
    html += `<rect width="${tableWidth}" height="${totalHeight}" fill="#fff"/>`;
    
    if (title) {
        html += `<text x="${tableWidth/2}" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${title}</text>`;
    }
    
    // Header row
    let headerHtml = '';
    for (let i = 0; i < columns.length; i++) {
        const x = 10 + i * colWidth;
        const textY = titleHeight + headerHeight / 2 + 5;
        headerHtml += `<rect x="${x}" y="${titleHeight}" width="${colWidth - 4}" height="${headerHeight - 8}" fill="#4A90D9" rx="2"/>`;
        headerHtml += `<text x="${x + colWidth/2}" y="${textY}" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">${columns[i]}</text>`;
    }
    
    // Data rows with zebra striping
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const y = titleHeight + headerHeight + i * rowHeight;
        const bgFill = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
        
        html += `<rect x="10" y="${y}" width="${tableWidth - 20}" height="${rowHeight}" fill="${bgFill}"/>`;
        
        for (let j = 0; j < columns.length && j < Object.keys(row).length; j++) {
            const key = columns[j];
            const x = 10 + j * colWidth;
            const textY = y + rowHeight / 2 + 5;
            const val = String(row[key] ?? '-').substring(0, 18);
            
            html += `<text x="${x + 12}" y="${textY}" font-size="11" fill="#333">${val}</text>`;
        }
    }
    
    html += `</svg>`;
    return html;
}

export async function handler(args) {
    const data = args.data || [];
    const title = args.title;
    
    log('INFO', 'render_table', 'generating', `data: ${Array.isArray(data) ? data.length + ' rows' : data}`);
    
    if (!Array.isArray(data)) {
        return JSON.stringify({ error: "data должен быть массивом" });
    }
    
    if (data.length === 0) {
        return JSON.stringify({ error: "Массив данных пуст", svg: '' });
    }
    
    const svg = generateSvgTable(data, title);
    log('INFO', 'render_table', 'svg_ready', `SVG length: ${svg.length} chars`);
    
    return JSON.stringify({ svg: svg });
}
