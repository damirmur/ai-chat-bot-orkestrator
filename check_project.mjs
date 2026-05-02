import fs from 'fs';

// Hardcoded path to avoid PowerShell issues
const PROJECT_ROOT = process.cwd();
console.log('Project root:', PROJECT_ROOT);

try {
  const files = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
  console.log('\nContents of mcp-servers/ai-file:\n');
  
  const aiFiles = [];
  for (const file of files) {
    if (file.name === 'ai-file' && file.isDirectory()) {
      const aiContent = fs.readdirSync(process.joinPaths(PROJECT_ROOT, file.name), { recursive: true });
      aiFiles.push(...aiContent);
      console.log(`Found ai-file/ with ${aiContent.length} files`);
    }
  }
  
  console.log('\nTotal:', aiFiles.length);
} catch(e) {
  console.error('Error:', e.message);
}
