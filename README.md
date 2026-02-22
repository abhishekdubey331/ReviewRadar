<h1 align="center">ReviewRadar</h1>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-blue.svg?cacheSeconds=2592000" />
  <img alt="Node Version" src="https://img.shields.io/badge/node-%3E%3D18.0.0-success.svg" />
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" />
</p>

<p align="center">
  <b>A powerful Model Context Protocol (MCP) server that empowers LLMs to ingest, analyze, index, and autonomously intelligently query user reviews directly from the Google Play Store or Apple App Store.</b>
</p>

---

## ✨ Features

- **🌍 Universal Scraping**: Seamlessly download up to 50,000 recent reviews by simply providing an App Store or Play Store link.
- **🤖 LLM Agnostic**: Effortlessly swap your intelligence backend between **OpenAI (GPT-4o)** and **Anthropic (Claude)** using your API Keys.
- **🧠 Smart Analytics Pipeline**: Routes intense abstract categorization tasks directly to the LLMs, while handling fast-path deterministic metadata routing to save API costs.
- **🔍 Semantic Vector Search**: Includes an embedded, blazingly fast in-memory WebAssembly Vector Database (`voy-search`) for querying feedback via raw natural language.
- **🛡️ PII Redaction Engine**: Automatically redacts names, email addresses, and specific sensitive patterns *before* ever touching the LLM. 
- **⚡ MCP Native Interfaces**: Built from the ground-up strictly adhering to the `modelcontextprotocol` to plug directly into Cursor IDE and Claude Desktop seamlessly.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- An API Key from [OpenAI](https://platform.openai.com/) or [Anthropic](https://console.anthropic.com/)

### 2. Installation & Configuration

Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/AppReviewsMCP.git
cd AppReviewsMCP
npm install
```

Set up your `APP_LINK` and API Keys:
```bash
cp .env.example .env
```
Edit `.env`:
```env
# Example for Android (WhatsApp):
APP_LINK=https://play.google.com/store/apps/details?id=com.whatsapp

# Or Example for iOS (WhatsApp):
# APP_LINK=https://apps.apple.com/us/app/whatsapp/id310633997

OPENAI_API_KEY=sk-... # Your Provider Key Here
```

### 3. Fetch Data & Build

Scrape thousands of reviews formatted intelligently to the data payload structure, then compile the server.
```bash
npm run scrape
npm run build
```

---

## 🔌 Connecting an MCP Client

### Cursor (Recommended Developer Experience)
1. Open Cursor Settings -> **Features** -> **MCP Servers**
2. Click `+ Add New MCP Server`
3. Enter `AppReviews` as the name.
4. Select `command` as the type.
5. Enter the exact absolute command: `node /absolute/path/to/AppReviewsMCP/dist/index.js`
6. Click Save and authorize the server when prompted.

### Claude Desktop
Edit your `claude_desktop_config.json` config settings:
```json
{
  "mcpServers": {
    "app-reviews": {
      "command": "node",
      "args": ["/absolute/path/to/AppReviewsMCP/dist/index.js"],
      "env": {
        "APP_LINK": "https://play.google.com/store/apps/details?id=com.whatsapp",
        "OPENAI_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

---

## 🛠️ Included Server Tools

Once attached, your LLM context has implicit access to orchestrate logic using these capabilities:

| Tool Name | Description |
| :--- | :--- |
| `reviews_import` | Ingests and chunk boundaries reviews from the `sample_data/scraped_reviews.csv` into the in-memory semantic vector database. |
| `reviews_search` | Perform fuzzy and semantic natural language searches (e.g., *"Find reviews complaining about battery drain"*). |
| `reviews_analyze` | Analyze batches of reviews assigning dynamic categories, sentiment scores, and determining core friction points concurrently. |
| `reviews_get_safety_alerts` | Instantly bypass LLM latency to retrieve deterministically identified Priority 0 (Emergency) vulnerabilities & P1 crashes. |
| `reviews_summarize` | Map-reduce your semantic analysis into aggregate themes, feature vectors, and quantified bug clusters. |
| `reviews_reply_suggest` | Draft policy-compliant, developer-friendly brand support responses to individual user reviews automatically. |
| `reviews_export` | Ship intelligence insights into neatly collated Markdown or Jira Ticket formats. |

---

## 🧪 Testing & Development

The repository includes a comprehensive 51-suite unit testing paradigm validating deterministic Rule Engine isolation, asynchronous LLM routing, and Circuit Breakers.
```bash
npm run test
```

To run TypeScript verification against standard implementations:
```bash
npm run verify
```

## Contributing`nContributions, issues, and feature requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and use the repository issue tracker for bugs and proposals.`n`n## License`nThis project is licensed under the [MIT License](LICENSE).
