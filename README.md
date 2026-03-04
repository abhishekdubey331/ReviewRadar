# 🚨 ReviewRadar

**Turn raw App Store reviews into prioritized product intelligence.**

ReviewRadar is an **MCP server** that ingests mobile app reviews, indexes them, and converts them into **actionable product insights** for teams shipping fast.

Instead of manually reading thousands of reviews, ReviewRadar helps detect **critical issues, trends, and product priorities automatically.**

---

# ✨ Why ReviewRadar

Product teams drown in app reviews.

ReviewRadar turns messy feedback into:

⚡ **Critical alerts** for business-breaking issues  
📊 **Trend analysis** across weeks or releases  
🔎 **Semantic search** across thousands of reviews  
🎯 **Prioritized issue insights** for sprint planning  
📄 **Export-ready reports** for PMs and leadership  

All while **redacting PII before any LLM processing**.

---

# 🧠 What It Does

ReviewRadar collects reviews from mobile app stores and transforms them into **structured product intelligence**.

Key capabilities:

- 📥 Import reviews from **Google Play** and **Apple App Store**
- 🧠 Hybrid analysis using **rules + optional LLM insights**
- 🔒 **PII redaction** before LLM processing
- 🚨 Detect **P0/P1 critical customer issues**
- 📊 Identify **top product pain points**
- 📈 Monitor **issue trends over time**
- 🔍 **Semantic search** across reviews
- 📤 Export **PM-ready summaries and reports**

---

# 🏷 Issue Taxonomy

ReviewRadar classifies feedback into meaningful product categories:

- 🐞 Bug
- ⚡ Performance
- 🎨 UX
- 🔐 Account / Authentication
- 💳 Payments / Transactions
- 💰 Billing / Pricing
- 🛡 Trust / Fraud
- 📞 Support / Service
- ❌ Cancellation / Retention
- 🔄 Data / Sync
- 🚨 Safety Concern
- 💡 Feature Request
- ❤️ Praise

---

# 📊 Example Output

Example weekly product report generated from app reviews:

```text
Top Issues This Week

P0 – Login failures (124 reports)
P0 – Payment errors during checkout (78 reports)
P1 – App crashes on Android 14 (63 reports)

Trend Changes

Billing complaints ↑ 45%
Crash reports ↓ 20%

Recommended Sprint Priorities

1. Stabilize login retry flow
2. Fix checkout payment failures
3. Address Android 14 crash regression
```

This gives product teams **immediate insight into what to fix next.**

---

# ⚡ Quick Start

Clone the repository:

```bash
git clone https://github.com/<your-org-or-user>/ReviewRadar.git
cd ReviewRadar
```

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
cp .env.example .env
```

Set required environment variables:

```bash
APP_LINK=https://play.google.com/store/apps/details?id=com.example.app
SUPPORT_BRAND_NAME=your app
OPENAI_API_KEY=sk-...
```

Run the full pipeline:

```bash
npm run scrape
npm run build
npm start
```

---

# 🔌 Connect As MCP Server

Entry point:

```bash
node /absolute/path/to/ReviewRadar/dist/index.js
```

Use this command in your **MCP client configuration** (Cursor or other MCP-compatible tools).

---

# 🧰 Example Product Questions

ReviewRadar allows natural-language product analysis.

Examples:

**Import latest reviews**

```text
Import the latest app reviews and tell me if the data is ready for analysis.
```

**Critical issue detection**

```text
What are the most critical customer issues right now that need escalation?
```

**Weekly insights**

```text
Give me the top customer pain points this week with counts and severity.
```

**Trend monitoring**

```text
Show me trends over the last 8 weeks and call out rising problems.
```

**Sprint prioritization**

```text
Prioritize the top 10 issues for the next sprint.
```

**Leadership report**

```text
Generate a PM weekly report I can paste to leadership.
```

---

# 🏗 Architecture

High-level pipeline:

```text
App Stores
↓
Scrape / Import
↓
Vector + Metadata Storage
↓
Analysis Engine
↓
MCP Tools
↓
IDE / Agent Client
```

Primary storage artifacts:

```text
storage/vector_index.json
storage/metadata.json
```

---

# 🧪 Development

Run development checks:

```bash
npm run lint
npm run test
npm run verify
npm run build
```

---

# 📚 Documentation

Additional documentation:

- Setup Guide → docs/setup_guide.md  
- Architecture → docs/architecture.md  
- Testing Standards → docs/testing_guidelines.md  
- Contribution Guide → CONTRIBUTING.md  
- Security Policy → SECURITY.md  

---

# 🗺 Roadmap

Future improvements:

- 🔌 Provider-agnostic embeddings
- 📊 Dashboard-ready trend APIs
- 🧠 Advanced clustering of review issues
- 📈 Long-term release impact analysis

---

# 🤝 Contributing

Contributions are welcome.

Steps:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

# 📜 License

MIT License.

See `LICENSE` for details.

---

⭐ If this project helps you understand customer feedback faster, consider starring the repo!
