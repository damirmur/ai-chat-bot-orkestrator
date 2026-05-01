/**
 * COGNITIVE LOOP ORCHESTRATOR — Full iterative planning implementation
 */

import { log } from '../logger.mjs';
import { TOOL_REQUIREMENTS, validateStepChain, canToolAcceptFrom, getIncompatiblePairs } from './tool_requirements.mjs';
import { TOOL_CATALOG, isToolAtomic } from './tool_catalog.mjs';

// Constants
const MAX_ITERATIONS = 10;
const ITERATION_TIMEOUT_MS = 30000;

/**
 * Main entry point - runs cognitive loop until final result or max iterations
 */
export async function handleCognitiveLoop(query, peerId) {
    log('INFO', 'cognitive_loop', 'started', `Query: ${query.substring(0, 100)}...`);
    
    const knowledgeBase = [];
    let iteration = 0;
    let currentStepIndex = -1;
    
    try {
        while (iteration < MAX_ITERATIONS) {
            iteration++;
            
            // Check for interruption
            if (!await checkForInterruption(query, peerId)) break;
            
            // === ITERATION 1: Self-Analysis (Level 1) ===
            const analysis = await analyzeState(query, knowledgeBase);
            
            log('INFO', 'cognitive_loop', `iteration_${iteration}_analysis`, {
                iteration,
                knownFactsCount: analysis.knownFacts?.length || 0,
                missingData: analysis.missingData || [],
                canAnswerDirectly: analysis.canAnswerDirectly
            });
            
            // Check if we already have final answer
            if (analysis.hasFinalResult) {
                log('INFO', 'cognitive_loop', `iteration_${iteration}_complete`, 'Final result found');
                break;
            }
            
            // === ITERATION 2: Plan next step (Level 2) ===
            const plan = await generatePlan(analysis, iteration);
            
            if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
                log('WARN', 'cognitive_loop', `iteration_${iteration}_no_plan`, 'No valid steps generated');
                
                if (iteration >= MAX_ITERATIONS - 1) {
                    return [{ type: 'text', content: "Я не смог выполнить ваш запрос. Попробуйте сформулировать вопрос по-другому." }];
                }
                
                // Try reformulating and continuing
                continue;
            }
            
            // === ITERATION 3: Validate step chain ===
            const validationErrors = validateStepChain(plan.steps);
            if (validationErrors.length > 0) {
                log('ERROR', 'cognitive_loop', `iteration_${iteration}_invalid_chain`, 
                    `${validationErrors[0].message}`);
                
                // Plan is invalid — model needs to fix it
                currentStepIndex = -1;
                continue;
            }
            
            // === ITERATION 4: Execute steps ===
            const executionResults = await executePlan(plan.steps, peerId);
            
            if (executionResults.hasError) {
                log('ERROR', 'cognitive_loop', `iteration_${iteration}_exec_failed`, 
                    `${executionResults.errorDetail}`);
                
                currentStepIndex = -1; // Reset to allow model to try different approach
                continue;
            }
            
            // === ITERATION 5: Update knowledge base and state ===
            updateKnowledgeBase(executionResults.results, knowledgeBase);
            
            if (plan.steps.length > 0) {
                currentStepIndex = Math.min(currentStepIndex + 1, plan.steps.length - 1);
            }
        }
        
        // Build final response
        return buildFinalResponse(knowledgeBase, query);
        
    } catch (error) {
        log('ERROR', 'cognitive_loop', 'fatal_error', error.message);
        throw error;
    }
}

/**
 * ITERATION 1: Self-Analysis — What do I know? What's missing?
 */
export async function analyzeState(query, knowledgeBase) {
    const analysis = {
        query: query.toLowerCase(),
        knownFacts: [],
        missingData: [],
        canAnswerDirectly: false,
        hasFinalResult: false,
        suggestedTools: []
    };
    
    // Extract user intent from query (basic NLP)
    const intents = extractIntents(query);
    
    for (const intent of intents) {
        if (intent.type === 'greeting') {
            analysis.canAnswerDirectly = true;
            analysis.knownFacts.push('Приветствие — знаю как ответить');
            
        } else if (intent.type === 'fact_lookup' && intent.targetCity) {
            const cityCoords = FACTS.getCoordinates(intent.targetCity);
            if (cityCoords) {
                analysis.knownFacts.push(`Координаты ${intent.targetCity}: lat=${cityCoords.lat}, lon=${cityCoords.lon}`);
                analysis.suggestedTools.push('weather_api');
                
                // Check for weather data in knowledge base
                const hasWeather = knowledgeBase.some(kb => 
                    kb.sourceTool === 'weather_api' && !kb.isFinalResult
                );
                
                if (hasWeather) {
                    analysis.missingData.push('Погода уже запрашивается');
                    analysis.hasFinalResult = true;
                } else {
                    analysis.missingData.push(`Погода в ${intent.targetCity}`);
                    analysis.suggestedTools.push('weather_api');
                }
                
            } else {
                analysis.knownFacts.push(`${intent.targetCity} не найден в базе фактов`);
                analysis.missingData.push(`Координаты для ${intent.targetCity}`);
                analysis.suggestedTools.push(['fact_lookup', 'web_search']);
            }
            
        } else if (intent.type === 'finance' && intent.symbol) {
            const hasFinanceData = knowledgeBase.some(kb => kb.sourceTool === 'get_finance_data');
            if (!hasFinanceData) {
                analysis.missingData.push(`Финансовые данные для ${intent.symbol}`);
                analysis.suggestedTools.push('get_finance_data');
            } else {
                analysis.hasFinalResult = true;
            }
            
        } else if (intent.type === 'simple_reply') {
            analysis.canAnswerDirectly = true;
            analysis.knownFacts.push(`Простой вопрос — знаю ответ: ${intent.response}`);
        }
    }
    
    // Check for negative/forbidden requests
    if (query.includes('shell_command') || query.includes('команду')) {
        const hasAccess = checkPeerAccess(peerId);
        if (!hasAccess) {
            analysis.knownFacts.push(`peerId ${peerId} не совпадает с USER_ID`);
            analysis.hasFinalResult = true; // Negative answer is still final
        }
    }
    
    return analysis;
}

/**
 * ITERATION 2: Generate plan based on analysis
 */
export async function generatePlan(analysis, iteration) {
    const steps = [];
    
    if (analysis.canAnswerDirectly) {
        // Simple direct response
        if (analysis.query.startsWith('привет')) {
            return [{ tool: 'reply', args: { text: "Привет! Чем могу помочь?" }}];
        } else if (analysis.knownFacts.some(f => f.includes('простой вопрос'))) {
            const response = extractSimpleResponse(analysis.query);
            return [{ tool: 'reply', args: { text: response }}];
        }
        
    } else if (analysis.suggestedTools.length > 0) {
        // Build chain based on suggested tools
        
        // Step 1: Get system time for context
        steps.push({ tool: 'get_system_time', args: {} });
        
        const firstTool = analysis.suggestedTools[0];
        
        if (firstTool === 'fact_lookup') {
            // Find city from query and look up coords
            const cityMatch = analysis.query.match(/(вашингтон|пекин|лондон|москва)/i);
            const city = cityMatch ? cityMatch[1].toLowerCase() : 'Вашингтон';
            
            steps.push({ 
                tool: 'fact_lookup', 
                args: { query: city }
            });
            
        } else if (firstTool === 'get_finance_data') {
            // Find symbol from query  
            const symbolMatch = analysis.query.match(/(bitcoin|btc|биткоин)/i);
            const symbol = symbolMatch ? 'BTC-USD' : 'RUB=X';
            
            steps.push({ 
                tool: 'agent_single_facts', 
                args: { query: `цена ${symbol}` }
            });
            
        } else if (firstTool === 'web_search') {
            // Need to find coordinates first before weather
            const cityMatch = analysis.query.match(/(вашингтон|пекин|лондон)/i);
            let searchQuery = 'погода';
            
            if (cityMatch) {
                searchQuery += ` ${cityMatch[1]}`;
            }
            
            steps.push({ 
                tool: 'web_search', 
                args: { query: searchQuery }
            });
        }
    } else if (analysis.hasFinalResult) {
        // Already have answer, just need to reply
        const responses = knowledgeBase.filter(kb => kb.isFinalResult);
        return [{ tool: 'reply', args: { text: formatResponse(responses) }}];
    }
    
    log('INFO', 'cognitive_loop', `iteration_${iteration}_plan`, JSON.stringify({ steps, iteration }));
    return steps;
}

/**
 * ITERATION 4: Execute plan steps
 */
async function executePlan(steps, peerId) {
    const results = [];
    let hasError = false;
    
    for (const step of steps) {
        try {
            // Import and call executor
            const { executeStep } = await import('./executor.mjs');
            const result = await executeStep(step);
            
            log('INFO', 'cognitive_loop', `step_${step.tool}`, `${result.status || 'completed'}`);
            results.push(result);
            
        } catch (e) {
            hasError = true;
            log('ERROR', 'cognitive_loop', 'step_execution_error', `${step.tool}: ${e.message}`);
            break;
        }
    }
    
    return { results, hasError };
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
            // Negative results are still final answers
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
 * Build final response from completed entries
 */
export function buildFinalResponse(knowledgeBase, query) {
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

// === UTILITY FUNCTIONS ===

function checkForInterruption(query, peerId) {
    // Placeholder for VK interrupt handling
    return false;
}

function extractIntents(query) {
    const intents = [];
    const q = query.toLowerCase();
    
    if (/^привет|здравствуй|как дела/i.test(q)) {
        intents.push({ type: 'greeting' });
    }
    
    if (/(вашингтон|пекин|лондон|москва|париж)/i.test(q) && /погода/i.test(q)) {
        const cityMatch = q.match(/(вашингтон|пекин|лондон|москва|париж)/i);
        intents.push({ 
            type: 'fact_lookup', 
            targetCity: cityMatch ? cityMatch[1] : ''
        });
    }
    
    if (/(bitcoin|btc|биткоин)/i.test(q) || /(доллар|евро)/i.test(q)) {
        intents.push({ type: 'finance' });
    }
    
    if (/привет/i.test(q)) {
        intents.push({ 
            type: 'simple_reply', 
            response: "Привет! Чем могу помочь?"
        });
    }
    
    return intents;
}

const FACTS = new Map([
    ['вашингтон', { lat: 38.9072, lon: -77.0369 }],
    ['пекин', { lat: 39.9042, lon: 116.4074 }],
    ['лондон', { lat: 51.5074, lon: -0.1278 }],
    ['париж', { lat: 48.8566, lon: 2.3522 }]
]);

FACTS.getCoordinates = function(city) {
    const key = city.toLowerCase();
    return FACTS.has(key) ? FACTS.get(key) : null;
};

function checkPeerAccess(peerId) {
    // In real implementation, compare with USER_ID from env
    return false; // Default: no access for testing
}

function extractSimpleResponse(query) {
    if (query.includes('привет')) return "Привет! Чем могу помочь?";
    return "Хорошо, спасибо!";
}

function formatResponse(entries) {
    const text = entries.map(e => e.answer).join('\n');
    return text.substring(0, 3500);
}

function getQuestionFromTool(toolName) {
    const map = {
        'get_system_time': 'Текущее время?',
        'fact_lookup': 'Факт о городе?',
        'weather_api': 'Погода в регионе?',
        'agent_single_facts': 'Финансовые данные?',
        'web_search': 'Поисковые результаты?'
    };
    return map[toolName] || `${toolName} результат`;
}

function extractAnswerFromResult(result) {
    if (!result.result) return null;
    
    try {
        const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
        
        // Extract text content
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
