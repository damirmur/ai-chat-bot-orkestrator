import sharp from 'sharp';

export const definition = {
    type: "function",
    function: {
        name: "render_table",
        description: "Отобразить массив данных в виде таблицы с чередованием строк (зебра)",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "Заголовок таблицы" },
                data: { type: "array", description: "Массив объектов данных" },
                columns: {
                    type: "array",
                    description: "Массив колонок: [{\"key\": \"field\", \"header\": \"Название\"}]",
                    items: {
                        type: "object",
                        properties: {
                            key: { type: "string" },
                            header: { type: "string" }
                        }
                    }
                }
            },
            required: ["data"]
        }
    }
};

function generateSvgTable(title, data, columns) {
    const rows = data.slice(0, 100);
    const colWidth = 140;
    const headerHeight = 45;
    const rowHeight = 35;
    const tableWidth = columns.length * colWidth + 20;
    const tableHeight = headerHeight + rows.length * rowHeight + 20;
    const titleHeight = title ? 40 : 0;
    const totalHeight = titleHeight + tableHeight + 20;
    
    let theadCols = '';
    let colPositions = [];
    let x = 10;
    for (const col of columns) {
        colPositions.push(x);
        theadCols += `<text x="${x + colWidth/2}" y="30" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="white">${col.header}</text>`;
        x += colWidth;
    }
    
    let tbody = '';
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const y = titleHeight + headerHeight + i * rowHeight;
        const bgFill = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
        const textY = y + rowHeight / 2 + 5;
        
        // Background row
        tbody += `<rect x="10" y="${y}" width="${tableWidth - 20}" height="${rowHeight}" fill="${bgFill}"/>`;
        
        // Cells
        let cellX = 10;
        for (const col of columns) {
            const val = String(row[col.key] ?? '-');
            tbody += `<text x="${cellX + 10}" y="${textY}" font-family="Arial" font-size="12" fill="#333">${val.substring(0, 18)}</text>`;
            cellX += colWidth;
        }
    }
    
    // Header background
    const headerFill = `<rect x="10" y="${titleHeight}" width="${tableWidth - 20}" height="${headerHeight}" fill="#4A90D9" rx="4"/>`;
    
    // Borders
    const borderRects = `<rect x="10" y="${titleHeight}" width="${tableWidth - 20}" height="${tableHeight}" fill="none" stroke="#dee2e6" stroke-width="1"/>`;
    
    // Title
    let titleSvg = '';
    if (title) {
        titleSvg = `<text x="${tableWidth/2}" y="28" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold" fill="#333">${title}</text>`;
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${tableWidth}" height="${totalHeight}" viewBox="0 0 ${tableWidth} ${totalHeight}">
    <rect width="${tableWidth}" height="${totalHeight}" fill="white"/>
    ${titleSvg}
    ${headerFill}
    ${theadCols}
    ${tbody}
    ${borderRects}
</svg>`;
}

export async function handler(args) {
    const { data, title, columns: customColumns } = args;
    
    console.log(`[ render_table ] title:`, title);
    console.log(`[ render_table ] data:`, typeof data, Array.isArray(data) ? `(${data.length} rows)` : '');
    console.log(`[ render_table ] columns:`, customColumns ? customColumns.length : 'auto');
    if (Array.isArray(data) && data.length > 0) {
        console.log(`[ render_table ] first row:`, data[0]);
    }
    
    if (!Array.isArray(data)) {
        return JSON.stringify({ error: "data должен быть массивом" });
    }
    
    if (data.length === 0) {
        return JSON.stringify({ error: "Массив данных пуст" });
    }
    
    // Автоопределение колонок
    let columns = customColumns;
    if (!columns) {
        const firstRow = data[0];
        columns = Object.keys(firstRow).map(key => ({
            key,
            header: key.charAt(0).toUpperCase() + key.slice(1)
        }));
    }
    
    console.log(`[ render_table ] generating SVG, columns:`, columns.length);
    const svg = generateSvgTable(title, data, columns);
    console.log(`[ render_table ] SVG length:`, svg.length);
    
    // Конвертируем SVG в PNG
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    console.log(`[ render_table ] PNG generated:`, png.length);
    
    const base64 = png.toString('base64');
    
    return JSON.stringify({
        image: `data:image/png;base64,${base64}`,
        title: title || 'Таблица',
        rows: data.length,
        columns: columns.length
    });
}