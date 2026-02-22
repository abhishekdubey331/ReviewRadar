export const TOOL_DEFINITIONS = [
  {
    name: "reviews_import",
    description: "Import app reviews securely from the auto-scraped dataset.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "object", description: "Optional source override. If omitted, uses sample_data/scraped_reviews.csv." }
      }
    }
  },
  {
    name: "reviews_analyze",
    description: "Analyze reviews using hybrid deterministic rules and LLM routing.",
    inputSchema: {
      type: "object",
      properties: { source: { type: "object" }, options: { type: "object" } },
      required: ["source"]
    }
  },
  {
    name: "reviews_get_safety_alerts",
    description: "Fast-path tool to get only P0 and P1 safety alerts.",
    inputSchema: {
      type: "object",
      properties: { source: { type: "object" }, options: { type: "object" } },
      required: ["source"]
    }
  },
  {
    name: "reviews_summarize",
    description: "Summarize a list of analyzed reviews to extract themes and counts.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } } },
      required: ["reviews"]
    }
  },
  {
    name: "reviews_reply_suggest",
    description: "Draft a policy-compliant reply to a user review.",
    inputSchema: {
      type: "object",
      properties: { review_text: { type: "string" }, tone: { type: "string" } },
      required: ["review_text"]
    }
  },
  {
    name: "reviews_export",
    description: "Export analyzed reviews into different formats (e.g. Markdown or Jira).",
    inputSchema: {
      type: "object",
      properties: { format: { type: "string", enum: ["markdown", "jira"] }, reviews: { type: "array", items: { type: "object" } } },
      required: ["format", "reviews"]
    }
  },
  {
    name: "reviews_top_issues",
    description: "Rank the top issue clusters by issue type and feature area.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"]
    }
  },
  {
    name: "reviews_segment_breakdown",
    description: "Group issues by dimensions like app version, device, locale, platform, or rating bucket.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews", "options"]
    }
  },
  {
    name: "reviews_time_trends",
    description: "Create day/week trend buckets for issue volume, severity, sentiment, and top issue keys.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"]
    }
  },
  {
    name: "reviews_compare_windows",
    description: "Compare baseline and current review windows for regressions and improvements.",
    inputSchema: {
      type: "object",
      properties: {
        baseline_reviews: { type: "array", items: { type: "object" } },
        current_reviews: { type: "array", items: { type: "object" } },
        options: { type: "object" }
      },
      required: ["baseline_reviews", "current_reviews"]
    }
  },
  {
    name: "reviews_spike_detection",
    description: "Detect issue spikes in the most recent day/week bucket.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"]
    }
  },
  {
    name: "reviews_priority_scoring",
    description: "Rank issue clusters by impact score for roadmap prioritization.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"]
    }
  },
  {
    name: "reviews_feature_ownership_map",
    description: "Map issue clusters to squads and owners using provided ownership rules.",
    inputSchema: {
      type: "object",
      properties: {
        reviews: { type: "array", items: { type: "object" } },
        ownership_rules: { type: "array", items: { type: "object" } },
        options: { type: "object" }
      },
      required: ["reviews", "ownership_rules"]
    }
  },
  {
    name: "reviews_weekly_report",
    description: "Generate weekly PM report with top issues, spikes, priorities, and ownership assignments.",
    inputSchema: {
      type: "object",
      properties: {
        reviews: { type: "array", items: { type: "object" } },
        ownership_rules: { type: "array", items: { type: "object" } },
        options: { type: "object" }
      },
      required: ["reviews"]
    }
  },
  {
    name: "reviews_search",
    description: "Semantically search through imported reviews using a natural language query with optional filtering and sorting.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query (e.g. 'battery drain problems')" },
        limit: { type: "number", default: 5 },
        min_score: { type: "number", description: "Minimum star rating (1-5)" },
        max_score: { type: "number", description: "Maximum star rating (1-5)" },
        start_date: { type: "string", description: "ISO date string (e.g. '2024-01-01')" },
        end_date: { type: "string", description: "ISO date string (e.g. '2024-12-31')" },
        sort_by: { type: "string", enum: ["relevance", "date"], default: "relevance", description: "Sort by semantic relevance or recency" },
        sort_direction: { type: "string", enum: ["asc", "desc"], default: "desc", description: "Chronological sort order: 'desc' for newest first, 'asc' for oldest first." }
      },
      required: []
    }
  },
  {
    name: "reviews_get_index_status",
    description: "Get diagnostic information about the vector database, including metadata health and record counts.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "reviews_diagnose_runtime",
    description: "Get runtime diagnostics for env loading and index storage paths (keys are masked).",
    inputSchema: { type: "object", properties: {} }
  }
] as const;
