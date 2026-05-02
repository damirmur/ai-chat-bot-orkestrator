import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('=== AI-File Project Setup ===\n');

// Check directories
const projectPath = resolve(__dirname, 'ai-file');
const exists = fs.existsSync(projectPath);
console.log(`Project directory: ${projectPath}`);
console.log(`Exists: ${exists}\n`);

if (exists) {
  const files = fs.readdirSync(projectPath, { recursive: true });
  console.log(`Total files in project: ${files.length}`);
  
  // Create .gitignore if not exists
  const gitignorePath = `${projectPath}/.gitignore`;
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `node_modules/
dist/
*.log
.DS_Store

# Editor files
.vscode/
.idea/
`);
    console.log(`Created .gitignore at ${gitignorePath}`);
  } else {
    console.log('.gitignore already exists');
  }
} else {
  console.log('Project directory not found!');
  process.exit(1);
}

console.log('\nSetup complete!');
