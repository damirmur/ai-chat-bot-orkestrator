/** Test script for checking updated definitions */
import('./orchestrator/tools_loader.mjs').then(async m => {
    await m.loadAllTools();
    
    // Check web_search definition
    const webSearch = m.getTool('web_search');
    if (webSearch) {
        console.log('\n=== web_search definition ===');
        console.log(JSON.stringify(webSearch.definition.parameters, null, 2));
        
        // Test handler with only query param (should work with fallback to env var)
        console.log('\n--- Testing handler without searchUrl ---');
        const result = await webSearch.handler({ query: 'test' });
        console.log('Result:', JSON.parse(result).error || 'Success (used fallback)');
    }
    
    // Check weather_api definition  
    const weatherApi = m.getTool('weather_api');
    if (weatherApi) {
        console.log('\n=== weather_api definition ===');
        console.log(JSON.stringify(weatherApi.definition.parameters, null, 2));
        
        // Test handler with only query param 
        console.log('\n--- Testing handler without apiKey ---');
        const result = await weatherApi.handler({ query: 'Moscow' });
        console.log('Result:', JSON.parse(result).error || 'Success (used fallback)');
    }
}).catch(e => {
    console.error('Error:', e.message);
});
