# Helper script to build and run the MCP server on Windows
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run build
node dist/index.js
