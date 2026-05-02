/**
 * COGNITIVE LOOP ORCHESTRATOR — Model-driven planning implementation
 */

import fs from 'node:fs';
import { log } from '../logger.mjs';

// Constants
const ITERATION_TIMEOUT_MS = 60000; // 60 секунд на шаг
const MAX_ITERATIONS = 10;
const STATE_FILE = 'state.json';

/**
 * State management helpers
 */
export function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const content = fs.readFileSync(STATE_FILE, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        log('ERROR', 'cognitive_loop', 'state_load_error', error.message);
    }

    return {
        currentRound: 0,
        knowledgeBase: [],
        roundsHistory: [],
        modelPlans: [],
        executorResults: []
    };
}

export function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        log('ERROR', 'cognitive_loop', 'state_save_error', error.message);
    }
}

/**
 * Model-driven planning loop
 */
export async function handleCognitiveLoop(query, peerId) {
    const state = loadState();

    try {
        while (state.currentRound < MAX_ITERATIONS) {
            await logMessage(`ROUND ${state.currentRound + 1} START`);

            // Шаг 1: Получить plan от модели
            const modelPlan = await requestModelPlan(query, state);
            state.modelPlans.push(modelPlan);

            // Шаг 2: Выполнить план через executor
            const results = await executePlan(modelPlan.steps || [], modelPlan);
            state.executorResults.push(results);

            // Шаг 3: Обновить knowledge base
            updateKnowledgeBase(results.results, state.knowledgeBase);

            // Шаг 4: Проверка на завершение
            if (hasFinalResult(results)) {
                const response = buildFinalResponse(state.knowledgeBase, query);
                await logMessage(`ROUND ${state.currentRound + 1} END | Final result found`);
                return response;
            }

            // Шаг 5: Сохранить round
            saveRoundResults(state.currentRound + 1, modelPlan, results);

            state.currentRound++;
        }

        // Max iterations reached - return error
        await logMessage('MAX_ITERATIONS_REACHED');
        return [{ type: 'text', content: "Не удалось выполнить запрос (превышено количество попыток)" }];

    } catch (error) {
        log('ERROR', 'cognitive_loop', 'fatal_error', error.message);
        throw error;
    }
}

/**
 * Функция для запроса плана у модели
 */
async function requestModelPlan(query, state) {
    const history = state.roundsHistory.slice(-3); // Последние 3 rounda

    const prompt = `
Previous query: "${query}"
Current round: ${state.currentRound + 1}

Available tools: weather_api (requires lat/lon), fact_lookup (requires city name), get_time, web_search, model_tool

IMPORTANT RULES:
- NEVER include lat/lon in weather_api calls. The model should NOT know coordinates.
- If weather_api is needed and lat/lon are missing, the orchestrator will add fact_lookup automatically.
- Only include tool names and their required arguments (like city name for fact_lookup).

Previous results (${history.length} rounds):
${history.map(h =>
    `${h.modelPlan}\n-> Results: ${JSON.stringify(h.executorResults)}`
).join('\n\n')}

Based on the previous results, plan ONLY the tools that need user-provided data (like city names).
Do NOT try to provide coordinates yourself.

Format: [{"tool": "tool_name", "args": {...}}, ...]
Example: [{"tool": "weather_api", "args": {"lat": 51.5074, "lon": -0.1278}}]

If you need city coordinates, plan fact_lookup with the city name first:
Example: [{"tool": "fact_lookup", "args": {"query": "London"}}]

Return ONLY valid JSON, no markdown or explanations.
    `;

    // Placeholder - replace with actual LLM call
    const defaultPlan = [{ tool: 'get_time', args: {} }];
    let plan = { steps: defaultPlan };

    // Auto-complete missing arguments
    plan = autoCompletePlan(plan, query);

    return plan;
}

/**
 * Auto-completion of plan by orchestrator
 */
function autoCompletePlan(plan, originalQuery = '') {
    if (!plan || !Array.isArray(plan.steps)) {
        return [];
    }

    // Если weather_api в плане, но нет get_time -> добавить автоматически
    const hasWeather = plan.steps.some(s => s.tool === 'weather_api');
    if (hasWeather && !plan.steps.some(s => s.tool === 'get_time')) {
        plan.steps.push({ tool: 'get_time', args: {} });
    }

    // Если weather_api требует lat/lon, но их нет -> добавить fact_lookup с исходным запросом
    const hasMissingCoords = plan.steps.some(s =>
        s.tool === 'weather_api' && !s.args?.lat && !s.args?.lon
    );
    if (hasMissingCoords) {


/**
 * Сохранение round результатов в state.json
 */
function saveRoundResults(roundNumber, plan, results) {
    const roundData = {
        roundNumber,
        modelPlan: JSON.stringify(plan),
        executorResults: results.map(r => ({
            tool: r.tool,
            result: r.result || (r.error ? null : undefined),
            error: r.error || null,
            isFinal: r.isFinal || false
        })),
        timestamp: new Date().toISOString()
    };

    state.roundsHistory.push(roundData);
    saveState(state);
}

/**
 * Executor with timeout and error handling
 */
async function executePlan(steps, toolsHandlers = null) {
    const results = [];

    for (const step of steps) {
        try {
            if (!step.tool) {
                log('WARN', 'executor', 'missing_tool', `Step missing tool definition: ${JSON.stringify(step)}`);
                continue;
            }

            // Валидация обязательных параметров перед вызовом
            const validationResult = validateToolArgs(step.tool, step.args);
            if (!validationResult.valid) {
                log('WARN', 'executor', 'missing_args', `${step.tool}: ${validationResult.reason}`);
                continue;  // Пропустить этот шаг, не выполняя
            }

            let fn = toolsHandlers?.[step.tool];
            if (!fn) {
                const { getLoadedTools } = await import('./tools_loader.mjs');
                const loaded = getLoadedTools().get(step.tool);
                if (loaded) fn = loaded.handler;
            }

            if (typeof fn !== 'function') {
                throw new Error(`Tool handler for '${step.tool}' not found or not a function`);
            }

            // Вызов инструмента с таймаутом 60s
            const result = await executeStepWithTimeout({ step, toolsHandlers }, 60000);
            results.push(result);

        } catch (error) {
            log('ERROR', 'executor', 'step_error', `${step.tool}: ${error.message}`);
            results.push({
                tool: step?.tool || 'unknown',
                error: error.message,
                status: 'failed'
            });

            if (isCriticalError(error)) {
                throw error;
            }
        }
    }

    return results;
}

/**
 * Валидация обязательных параметров инструмента перед вызовом
 */
function validateToolArgs(toolName, args) {
    const requiredParams = {
        'weather_api': ['lat', 'lon'],
        'fact_lookup': ['query']
    };

    if (!requiredParams[toolName]) {
        return { valid: true };
    }

    for (const param of requiredParams[toolName]) {
        const value = args?.[param];

        // Проверка на null, undefined или пустую строку
        if (value === null || value === undefined ||
            (typeof value === 'string' && value.trim() === '')) {
            return {
                valid: false,
                reason: `Missing required parameter '${param}'`
            };
        }
    }

    return { valid: true };
}

/**
 * Функция выполнения с таймаутом
 */
async function executeStepWithTimeout(step, toolsHandlers = null, timeoutMs = 60000) {
    const result = await Promise.race([
        (async () => {
            if (!toolsHandlers) {
                throw new Error('No toolsHandlers provided');
            }

            let fn = toolsHandlers[step.tool];
            if (!fn) {
                throw new Error(`Tool not found: ${step.tool}`);
            }

            return await fn(step.args, toolsHandlers);
        })(),

        // Timeout handler
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Step timeout after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);

    return result;
}

/**
 * Проверка критических ошибок
 */
function isCriticalError(error) {
    const criticalErrors = ['Timeout', 'Tool not found', 'Tool handler not found'];
    return criticalErrors.some(msg => error.message.includes(msg));
}

/**
 * Update knowledge base with results
 */
function updateKnowledgeBase(results, knowledgeBase) {
    for (const result of results) {
        const question = getQuestionFromTool(result.tool);

        if (!result.error && !result.result?.error) {
            knowledgeBase.push({
                stepNumber: knowledgeBase.length + 1,
                question: question,
                answer: extractAnswerFromResult(result),
                isFinalResult: result.isFinal || false,
                sourceTool: result.tool
            });
        } else if (result.error || result.result?.error) {
            knowledgeBase.push({
                stepNumber: knowledgeBase.length + 1,
                question: question,
                answer: `Ошибка: ${result.error || result.result.error}`,
                isFinalResult: true,
                sourceTool: result.tool
            });
        }
    }
}

/**
 * Проверка на финальный результат
 */
function hasFinalResult(results) {
    return results.some(r => r.isFinal === true || !r.error);
}

/**
 * Построение ответа
 */
function buildFinalResponse(knowledgeBase, query) {
    const finalEntries = knowledgeBase.filter(kb => kb.isFinalResult === true);

    if (finalEntries.length === 0) {
        return [{ type: 'text', content: "Я не смог найти ответ на ваш запрос. Попробуйте уточнить вопрос." }];
    }

    const firstText = finalEntries.find(e => e.answer?.type === 'text');
    const firstImage = finalEntries.find(e => e.answer?.type === 'image');
    const hasWeather = finalEntries.some(e =>
        e.sourceTool === 'weather_api' && e.answer?.temperature
    );

    if (firstText) {
        return [{ type: 'text', content: firstText.answer.text || firstText.answer }];
    } else if (firstImage) {
        return [{ type: 'image', data: firstImage.answer.data }];
    } else if (hasWeather) {
        const weatherEntry = finalEntries.find(e => e.sourceTool === 'weather_api');
        return [{
            type: 'text',
            content: `Погода: ${weatherEntry.answer.temperature}, ${weatherEntry.answer.condition}`
        }];
    }

    return [];
}

/**
 * Logging helper
 */
async function logMessage(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);

    // Сохранение в файл
    await fs.appendFile(`logs/cognitive_loop_${Date.now()}.log`,
        `[${timestamp}] ${message}\n`, 'utf8');
}

/**
 * Utility functions
 */
function getQuestionFromTool(toolName) {
    const map = {
        'get_system_time': 'Текущее время?',
        'fact_lookup': 'Факт о городе?',
        'weather_api': 'Погода в регионе?',
        'web_search': 'Поисковые результаты?'
    };
    return map[toolName] || `${toolName} результат`;
}

function extractAnswerFromResult(result) {
    if (!result.result) return null;

    try {
        const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;

        let answer = '';
        if (parsed.text) answer = parsed.text;
        else if (parsed.temperature) answer = `Температура: ${parsed.temperature}, Условия: ${parsed.condition || ''}`;
        else if (parsed.price) answer = `Цена: $${Number(parsed.price).toLocaleString()}`;
        else answer = JSON.stringify(parsed);

        return { type: 'text', text: answer };
    } catch (e) {
        return result.result;
    }
}
