# ReviewRadar

<p align="left">
  <strong>Turn raw app-store feedback into prioritized product intelligence.</strong><br/>
  ReviewRadar is an MCP server that ingests mobile reviews, indexes them, and produces actionable issue insights for teams shipping fast.
</p>

![Node >=18](https://img.shields.io/badge/node-%3E%3D18-3C873A?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-5.x-3178C6?logo=typescript&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-server-111827)
![License MIT](https://img.shields.io/badge/license-MIT-2563EB)

## Why ReviewRadar
- Collects reviews from Google Play and Apple App Store pipelines.
- Blends deterministic rules with optional LLM analysis for stable, explainable results.
- Redacts PII before LLM calls.
- Detects business-critical (P0/P1) alerts early via `reviews_get_critical_alerts`.
- Enables semantic search, trend analysis, prioritization, and export-ready summaries.

## What You Get
- **Ingestion + indexing:** import reviews and persist searchable vector artifacts.
- **Fast triage:** identify top issues, spikes, and ownership areas.
- **Time-aware insights:** compare windows and monitor trend movement.
- **Delivery-ready outputs:** produce markdown/Jira-friendly reporting payloads.
- **Broader issue taxonomy:** Bug, Performance, UX, Account/Auth, Payments/Transactions, Billing/Pricing, Trust/Fraud, Support/Service, Cancellation/Retention, Data/Sync, Safety Concern, Feature Request, Praise.

## Architecture At A Glance
```text
App Stores -> Scrape/Import -> Vector + Metadata Storage -> Analysis Engine -> MCP Tools -> IDE/Agent Client
```

Primary storage artifacts:
- `storage/vector_index.json`
- `storage/metadata.json`

## Quick Start
```bash
git clone https://github.com/<your-org-or-user>/ReviewRadar.git
cd ReviewRadar
npm install
cp .env.example .env
```

Set minimum required environment variables:
```env
APP_LINK=https://play.google.com/store/apps/details?id=com.example.app
SUPPORT_BRAND_NAME=your app
OPENAI_API_KEY=sk-...       # required for analysis + embeddings/search
```
Current provider support: OpenAI only.

Run end-to-end:
```bash
npm run scrape
npm run build
npm start
```

## Connect As MCP Server
Entrypoint:
```bash
node /absolute/path/to/ReviewRadar/dist/index.js
```

Use that command in your MCP client config (Cursor/other MCP-compatible clients).

## Tooling Surface
Full tool-by-tool details (purpose, sample prompt, expected output) are documented here:

- [Tooling Surface Guide](docs/tooling_surface.md)

## PM Prompt Cookbook
Use natural language. You do not need to reference MCP tool names.
For PM summary asks (top pain points/counts/severity), prefer `reviews_top_issues` flows over parsing raw `reviews_analyze` output.

- Import the latest app reviews and tell me if the data is ready for analysis.
- What are the most critical customer issues right now that need immediate escalation?
- Give me the top customer pain points this week with counts and severity.
- Compare this week vs last week and tell me what got worse or better.
- Show me trends over the last 8 weeks and call out rising problems.
- Did any issue spike recently? Tell me what likely caused it.
- Prioritize the top 10 issues for next sprint and explain why.
- Which app versions or platforms are causing the most complaints?
- Map current issues to likely owning teams and flag anything unowned.
- Generate a PM weekly report I can paste to leadership.
- Show me the full review text behind the "Unknown (unclassified issues)" cluster for the last 30 days.

## Development
```bash
npm run lint
npm run test
npm run verify
npm run build
```

Additional docs:
- Setup: `docs/setup_guide.md`
- Architecture: `docs/architecture.md`
- Testing standards: `docs/testing_guidelines.md`
- Contribution process: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`

## Roadmap Ideas
- Provider-agnostic embeddings
- Dashboard-ready trend API outputs
- Expanded issue taxonomy and auto-clustering

## License
MIT. See `LICENSE`.
