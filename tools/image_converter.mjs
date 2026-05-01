/**
 * IMAGE CONVERTER — Converts SVG data to PNG image using Sharp library
 * Used by draw_chart and render_table tools for final output
 */

import { log } from '../logger.mjs';
import sharp from 'sharp';

export const definition = {
    type: "function",
    function: {
        name: "image_converter",
        description: "Конвертировать SVG данные в PNG изображение. Принимает base64 SVG и возвращает base64 PNG.",
        parameters: {
            type: "object",
            properties: {
                svgBase64: {
                    type: "string",
                    description: "SVG данные в формате base64 (без data:image/svg+xml;base64, префикса)"
                },
                mimeType: {
                    type: "string",
                    enum: ["image/png", "image/jpeg"],
                    default: "image/png",
                    description: "Формат выходного изображения"
                }
            },
            required: ["svgBase64"]
        }
    }
};

export async function handler(args) {
    try {
        const { svgBase64, mimeType = 'image/png' } = args;
        
        if (!svgBase64 || typeof svgBase64 !== 'string') {
            log('ERROR', 'image_converter', 'invalid_svg', 'SVG base64 не указан или пуст');
            return JSON.stringify({ error: "Неверный формат SVG данных" });
        }

        // Remove data URL prefix if present (data:image/svg+xml;base64,xxx)
        let cleanSvg = svgBase64;
        const prefixMatch = svgBase64.match(/^data:image\/[^,]+;base64,/);
        if (prefixMatch) {
            cleanSvg = svgBase64.substring(prefixMatch[0].length);
        }

        log('INFO', 'image_converter', 'converting', `SVG length: ${cleanSvg.length} chars`);

        // Convert SVG to PNG using sharp
        const pngBuffer = await sharp(Buffer.from(cleanSvg, 'base64')).toFormat(mimeType === 'image/jpeg' ? 'jpeg' : 'png').toBuffer();
        
        const outputMime = mimeType.split('/')[1] || 'png';
        log('INFO', 'image_converter', 'success', `Converted to ${mimeType}, PNG size: ${(pngBuffer.length / 1024).toFixed(2)} KB`);

        return JSON.stringify({
            image: `data:${mimeType};base64,${pngBuffer.toString('base64')}`,
            mimeType: mimeType,
            format: outputMime
        });

    } catch (error) {
        log('ERROR', 'image_converter', 'error', error.message);
        
        // Check if it's a sharp-specific error
        let errorMessage = `Ошибка конвертации изображения: ${error.message}`;
        
        // Handle common sharp errors
        if (error.code === 'ENOENT') {
            errorMessage = "Библиотека sharp не установлена. Установите: npm install sharp";
        } else if (error.code === 'InvalidSvgError' || error.message.includes('svg')) {
            errorMessage = "Неверный формат SVG данных";
        }

        return JSON.stringify({ error: errorMessage });
    }
}
