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
    max_reviews: { type: "number", minimum: 1, maximum: 5000 },
    routing_model: { type: "string" },
    summary_model: { type: "string" },
    include_summary: { type: "boolean" },
    include_raw_text: { type: "boolean" },
    alert_limit: { type: "number", minimum: 1, maximum: 500 }
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
          description: "Optional source override. If omitted, the server uses its default local review dataset."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "reviews_analyze",
    description: "Deep review analysis tool (rules + LLM). Best for detailed review-level diagnostics, not the default entrypoint for PM summary asks.",
    inputSchema: {
      type: "object",
      properties: {
        source: SourceSchema,
        options: AnalyzeOptionsSchema
      },
      additionalProperties: false
    }
  },
  {
    name: "reviews_get_critical_alerts",
    description: "Fast-path tool to get business-critical alerts (P0/P1). If source is omitted, uses the default local review dataset.",
    inputSchema: {
      type: "object",
      properties: {
        source: SourceSchema,
        options: AnalyzeOptionsSchema
      },
      additionalProperties: false
    }
  },
  {
    name: "reviews_summarize",
    description: "Summarize analyzed reviews to extract themes and counts. Requires `reviews` from `reviews_analyze` output.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } } },
      required: ["reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_export",
    description: "Export analyzed reviews into different formats (e.g. Markdown or Jira). Requires analyzed `reviews` input.",
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
    description: "Primary PM summary entrypoint: returns top customer pain points with counts and severity. You can omit `reviews`; the server will resolve analyzed reviews automatically. Uses `this_week` by default if no window/date range is provided. Do not parse `reviews_analyze` output blobs for this use case.",
    inputSchema: {
      type: "object",
      properties: {
        reviews: { type: "array", items: { type: "object" } },
        options: {
          type: "object",
          properties: {
            window: { type: "string", enum: ["this_week", "last_7_days", "last_30_days", "last_90_days", "last_180_days", "last_12_months"] },
            filters: { type: "object" }
          },
          additionalProperties: true
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "reviews_segment_breakdown",
    description: "Group analyzed issues by app version, device, locale, platform, or rating bucket. Requires analyzed `reviews`.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews", "options"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_time_trends",
    description: "Create day/week trend buckets for issue volume, severity, sentiment, and top issue keys. Requires analyzed `reviews`.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_compare_windows",
    description: "Compare baseline and current analyzed review windows for regressions and improvements.",
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
    description: "Detect issue spikes in the most recent day/week bucket. Requires analyzed `reviews`.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_priority_scoring",
    description: "Rank issue clusters by impact score for roadmap prioritization. Requires analyzed `reviews`.",
    inputSchema: {
      type: "object",
      properties: { reviews: { type: "array", items: { type: "object" } }, options: { type: "object" } },
      required: ["reviews"],
      additionalProperties: false
    }
  },
  {
    name: "reviews_feature_ownership_map",
    description: "Map analyzed issue clusters to squads and owners using provided ownership rules.",
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
    description: "Generate weekly PM report with top issues, spikes, priorities, and ownership assignments from analyzed `reviews`.",
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
    name: "reviews_cluster_reviews",
    description: "Return full review rows for a specific issue cluster (issue_type/feature_area), including unknown-only drilldowns, with optional window or date filters.",
    inputSchema: {
      type: "object",
      properties: {
        reviews: { type: "array", items: { type: "object" } },
        options: {
          type: "object",
          properties: {
            issue_type: { type: "string" },
            feature_area: { type: "string" },
            include_unknown_only: { type: "boolean" },
            window: { type: "string", enum: ["this_week", "last_7_days", "last_30_days", "last_90_days", "last_180_days", "last_12_months"] },
            reference_date: { type: "string" },
            filters: { type: "object" },
            max_results: { type: "number", minimum: 1, maximum: 500 }
          },
          additionalProperties: true
        }
      },
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
