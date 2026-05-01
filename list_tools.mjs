import('./orchestrator/tools_loader.mjs').then(async m => {
    await m.loadAllTools();
    const tools = m.getAllTools();
    console.log('Available tools:', tools.map(t => t.name).join(', '));
}).catch(e => console.error('Error:', e.message));
