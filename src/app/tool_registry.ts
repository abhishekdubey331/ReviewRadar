const SourceSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["file"] },
        path: { type: "string", minLength: 1 }
      },
      required: ["type", "path"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["inline"] },
        reviews: {
          type: "array",
          minItems: 1,
          maxItems: 5000,
          items: { type: "object" }
        }
      },
      required: ["type", "reviews"],
      additionalProperties: false
    }
  ]
} as const;

const AnalyzeOptionsSchema = {
  type: "object",
  properties: {
    budget_usd: { type: "number" },
    concurrency: { type: "number", minimum: 1, maximum: 20 },
    routing_model: { type: "string" },
    summary_model: { type: "string" },
    include_summary: { type: "boolean" },
    include_raw_text: { type: "boolean" }
  },
  additionalProperties: false
} as const;

const ExportReviewSchema = {
  type: "object",
  properties: {
    review_id: { type: "string" },
    issue_type: { type: "string" },
    feature_area: { type: "string" },
    severity: { type: "string", enum: ["P0", "P1", "P2", "FYI"] },
    sentiment: { type: "string", enum: ["Positive", "Mixed", "Neutral", "Negative"] },
    signals: {
      type: "object",
      properties: {
        summary: { type: "string" },
        device: { type: "string" },
        os_version: { type: "string" },
        app_version: { type: "string" }
      },
      additionalProperties: false
    }
  },
  required: ["review_id", "issue_type", "feature_area", "severity", "sentiment"],
  additionalProperties: false
} as const;

export const TOOL_DEFINITIONS = [
  {
    name: "reviews_import",
    description: "Import app reviews securely from the auto-scraped dataset.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          ...SourceSchema,
          description: "Optional source override. If omitted, uses sample_data/scraped_reviews.csv."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "reviews_analyze",
    description: "Analyze reviews using hybrid deterministic rules and LLM routing.",
    inputSchema: {
      type: "object",
      properties: {
        source: SourceSchema,
        options: AnalyzeOptionsSchema
      },
      required: ["source"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_get_safety_alerts",
    description: "Fast-path tool to get high-priority alerts (P0/P1).",
    inputSchema: {
      type: "object",
      properties: {
        source: SourceSchema,
        options: AnalyzeOptionsSchema
      },
      required: ["source"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_summarize",
    description: "Summarize a list of analyzed reviews to extract themes and counts.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } } },
      required: ["reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_export",
    description: "Export analyzed reviews into different formats (e.g. Markdown or Jira).",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["markdown", "jira"] },
        reviews: { type: "array", maxItems: 5000, items: ExportReviewSchema }
      },
      required: ["format", "reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_top_issues",
    description: "Rank the top issue clusters by issue type and feature area.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_segment_breakdown",
    description: "Group issues by dimensions like app version, device, locale, platform, or rating bucket.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews", "options"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_time_trends",
    description: "Create day/week trend buckets for issue volume, severity, sentiment, and top issue keys.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"],
      additionalProperties: false
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
      required: ["baseline_reviews", "current_reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_spike_detection",
    description: "Detect issue spikes in the most recent day/week bucket.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_priority_scoring",
    description: "Rank issue clusters by impact score for roadmap prioritization.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"],
      additionalProperties: false
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
      required: ["reviews", "ownership_rules"],
      additionalProperties: false
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
      required: ["reviews"],
      additionalProperties: false
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
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "reviews_get_index_status",
    description: "Get diagnostic information about the vector database, including metadata health and record counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "reviews_diagnose_runtime",
    description: "Get runtime diagnostics for env loading and index storage paths (keys are masked).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  }
] as const;
