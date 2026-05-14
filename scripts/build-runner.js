const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const workspacePath = process.cwd();

console.log('Installing dependencies...');
execSync('pnpm install --prefer-frozen-lockfile --prefer-offline', { 
  cwd: workspacePath, 
  stdio: 'inherit' 
});

console.log('Building the Next.js project...');
execSync('pnpm next build', { 
  cwd: workspacePath, 
  stdio: 'inherit' 
});

console.log('Bundling server with tsup...');
execSync('pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify', { 
  cwd: workspacePath, 
  stdio: 'inherit' 
});

console.log('Build completed successfully!');
