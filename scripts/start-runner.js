const { execSync } = require('child_process');
const path = require('path');

const workspacePath = process.cwd();

console.log('Starting the Next.js production server...');
execSync('pnpm next start', { 
  cwd: workspacePath, 
  stdio: 'inherit' 
});
