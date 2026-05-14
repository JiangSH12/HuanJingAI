@echo off
setlocal

set "WORKSPACE_PATH=%CD%"

cd /d "%WORKSPACE_PATH%"

echo Installing dependencies...
pnpm install --prefer-frozen-lockfile --prefer-offline

echo Building the Next.js project...
pnpm next build

echo Bundling server with tsup...
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo Build completed successfully!
