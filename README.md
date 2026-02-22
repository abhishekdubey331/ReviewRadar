# ReviewRadar

ReviewRadar is a Model Context Protocol (MCP) server for ingesting, indexing, and analyzing mobile app reviews from Google Play and Apple App Store sources.

## Features
- Hybrid analysis pipeline (deterministic rules + optional LLM routing)
- Semantic search over imported reviews
- PII redaction before LLM calls
- Safety-alert fast path for P0/P1 issues
- Export tooling (Markdown/Jira payloads)

## Prerequisites
- Node.js >= 18
- At least one LLM provider key:
  - `OPENAI_API_KEY`, or
  - `ANTHROPIC_API_KEY`
- If both provider keys are set, `LLM_PROVIDER` must be set to `openai` or `anthropic`.
- For embedding-backed tools (`reviews_import`, `reviews_search`), set `OPENAI_API_KEY`.

## Quickstart
```bash
git clone https://github.com/<your-org-or-user>/ReviewRadar.git
cd ReviewRadar
npm install
cp .env.example .env
```

Update `.env` with your app link and provider key.

```env
APP_LINK=https://play.google.com/store/apps/details?id=com.example.app
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
SUPPORT_BRAND_NAME=your app
```

Build and run:
```bash
npm run scrape
npm run build
npm start
```

## MCP client configuration
Use `dist/index.js` as the MCP server entrypoint.

Example command:
```bash
node /absolute/path/to/ReviewRadar/dist/index.js
```

## Available tools
- `reviews_import`
- `reviews_search`
- `reviews_analyze`
- `reviews_get_safety_alerts`
- `reviews_summarize`
- `reviews_export`
- `reviews_top_issues`
- `reviews_segment_breakdown`
- `reviews_time_trends`
- `reviews_compare_windows`
- `reviews_spike_detection`
- `reviews_priority_scoring`
- `reviews_feature_ownership_map`
- `reviews_weekly_report`
- `reviews_get_index_status`
- `reviews_diagnose_runtime`

## Provider Capability Notes
- `reviews_search` requires `OPENAI_API_KEY` for embeddings.
- `reviews_import` can import reviews without embeddings, but `OPENAI_API_KEY` is required for successful vector indexing.

## Storage behavior
`reviews_import` persists vector artifacts to:
- `storage/vector_index.json`
- `storage/metadata.json`

Deployments must provide writable disk access to `storage/`.

## Development
Run checks:
```bash
npm run lint
npm run test
npm run verify
npm run build
```

## Contributing
See `CONTRIBUTING.md`.

## License
MIT. See `LICENSE`.
