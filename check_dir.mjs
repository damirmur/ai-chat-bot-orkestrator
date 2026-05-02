import fs from 'fs';

const path = 'D:.lmstudio/mcp-servers';
console.log('Checking:', path);
try {
  const files = fs.readdirSync(path);
  console.log(JSON.stringify(files, null, 2));
} catch(e) {
  console.error('Error:', e.message);
}
