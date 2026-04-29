/**
 * Test helper - exports initialized components for testing with real LM Studio
 */

import { loadEnvFile } from 'node:process';
import { ensureModelReady } from './lm_model_manager.mjs';
import { handleRequest } from './orchestrator/handler.mjs';
import { FINANCE_PROMPT } from './modules/finance/prompts.mjs';

try { loadEnvFile(); } catch (e) { console.error('[ERROR] .env file not found'); }

await ensureModelReady();

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || FINANCE_PROMPT;

const vk = null; // Not needed for tests
const API_URL = (process.env.LM_STUDIO_URL?.replace(/\/$/, '') || 'http://localhost:1234') + '/chat/completions';
const API_TOKEN = process.env.LM_STUDIO_API_KEY || 'lm-studio';

const toolsDefinition = [];
const toolsHandlers = {};

// --- LOAD TOOLS AND AGENTS ---
async function loadTools() {
    const fs = await import('node:fs');
    const path = await import('node:path');
    
    // Load from tools/
    const toolsPath = path.join(process.cwd(), 'tools');
    if (!fs.existsSync(toolsPath)) fs.mkdirSync(toolsPath);
    let files = fs.readdirSync(toolsPath).filter(file => file.endsWith('.mjs'));
    for (const file of files) {
        try {
            const tool = await import('file://' + path.join(toolsPath, file).replace(/\\/g, '/'));
            if (tool.definition && tool.handler) {
                toolsDefinition.push(tool.definition);
                toolsHandlers[tool.definition.function.name] = tool.handler;
            }
        } catch (err) {
            console.error('[ERROR] Failed to load tool ' + file + ': ' + err.message);
        }
    }
    
    // Load agents from modules/finance/
    const agentsPath = path.join(process.cwd(), 'modules', 'finance');
    if (fs.existsSync(agentsPath)) {
        files = fs.readdirSync(agentsPath).filter(file => file.endsWith('.mjs') && file.startsWith('agent_'));
        for (const file of files) {
            try {
                const agent = await import('file://' + path.join(agentsPath, file).replace(/\\/g, '/'));
                if (agent.definition && agent.handler) {
                    toolsDefinition.push(agent.definition);
                    toolsHandlers[agent.definition.function.name] = agent.handler;
                }
            } catch (err) {
                console.error('[ERROR] Failed to load agent ' + file + ': ' + err.message);
            }
        }
    }
}
await loadTools();

// Function to query LM Studio
async function askLM(messages, useTools = true) {
    const body = {
        model: process.env.MODEL_NAME || "local-model",
        messages: messages,
        temperature: 0.3,
        max_tokens: 1500,
        // Do NOT pass tools - force model to return JSON text only
        // The system prompt already lists all available tools
    };
    
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_TOKEN
        },
        body: JSON.stringify(body)
    });
    
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    
    const message = data.choices[0].message;
    
    // If model used tool_calls instead of JSON, convert to our format
    if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`[TEST] Fallback: model used tool_calls (${message.tool_calls.length} шт), converting...`);
        const steps = message.tool_calls.map(tc => ({
            tool: tc.function.name,
            args: JSON.parse(tc.function.arguments)
        }));
        return { content: JSON.stringify({ steps }) };
    }
    
    return message;
}

toolsHandlers.askLM = askLM;

export { handleRequest, askLM, toolsHandlers, SYSTEM_PROMPT };
