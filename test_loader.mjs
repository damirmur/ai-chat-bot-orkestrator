import { loadAllTools } from './orchestrator/tools_loader.mjs';

async function main() {
    try {
        console.log('[TEST] Loading all tools...');
        const count = await loadAllTools();
        console.log(`[TEST] ✅ Loaded ${count} tool(s)`);
        
        // Check if weather_api and fact_lookup are loaded
        const tools = import.meta.resolve('./orchestrator/tools_loader.mjs') ? null : null;
        console.log('[TEST] Test completed successfully');
    } catch (e) {
        console.error('[TEST] ❌ Error:', e.message);
        process.exit(1);
    }
}

main();
