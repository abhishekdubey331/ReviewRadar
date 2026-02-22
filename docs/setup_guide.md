# Developer Setup & Onboarding Guide

Welcome to the ReviewRadar MCP repository. Ensure you read `docs/PRD.md` and `docs/testing_guidelines.md` before writing code.

## 1. Local Environment Setup

**Prerequisites:**
*   Node.js (v18 or higher)
*   npm or pnpm
*   An active Anthropic API Key (or OpenAI API Key)

**Installation:**
```bash
git clone https://github.com/abhishekdubey331/ReviewRadar.git
cd ReviewRadar
npm install
```

**Environment Variables:**
Create a `.env` file in the root directory:
```bash
ANTHROPIC_API_KEY="sk-ant-api03-..."
# Optional: Set global budget circuit breaker
MAX_BATCH_BUDGET_USD="5.00"
```

## 2. Running the Development Server
To build the server and run the file locally (this will output JSON-RPC data, not human-readable text, because it is an MCP server):

```bash
npm run build
npm start
```

To build the server and run the file locally with the correct path configuration (Windows):

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path; npm run build; node dist/index.js
```

Or use the provided convenience script:
```powershell
./run_server.ps1
```

## 3. Testing in Cursor IDE
To actually test your code and MCP tools, you must "install" your local server into Cursor.

1. Open Cursor Settings.
2. Navigate to **Features > MCP Servers**.
3. Click **Add New MCP Server**.
4. Set the Type to: `command`.
5. Name it: `ReviewRadar-Dev`.
6. Command: `node /absolute/path/to/ReviewRadar/dist/index.js`
7. Click Save.

You can now open a Cursor Chat window and type: *"Can you use the reviews_analyze tool to check this fake review: 'The app crashes when I open my location sharing'?"*

## 4. Running the Evaluation Harness
Before making any commits (see `docs/testing_guidelines.md`), you must run the Vitest suite:

```bash
npm run test
```
If you add a golden dataset workflow later, document the script name in `package.json` and this guide in the same change.
