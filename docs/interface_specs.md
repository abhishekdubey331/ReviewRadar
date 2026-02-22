# ReviewRadar MCP Server Tool Interface Specs (v1.0)

This document contains the exact JSON schemas for the ReviewRadar MCP Server tools. These are the implementation contracts for request/response payloads.

All tools return either data or error (never both).

## Shared Types
```json
{
  "$id": "shared.types.schema.json",
  "type": "object",
  "definitions": {
    "Source": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "type": { "const": "file" },
            "path": { "type": "string", "minLength": 1 }
          },
          "required": ["type", "path"],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "type": { "const": "inline" },
            "reviews": {
              "type": "array",
              "minItems": 1,
              "maxItems": 5000,
              "items": { "$ref": "#/definitions/ReviewInput" }
            }
          },
          "required": ["type", "reviews"],
          "additionalProperties": false
        }
      ]
    },

    "ReviewInput": {
      "type": "object",
      "properties": {
        "review_id": { "type": "string" },
        "platform": { "type": "string", "enum": ["play_store", "app_store", "unknown"] },
        "user_name": { "type": "string" },
        "content": { "type": "string" },
        "score": { "type": "integer", "minimum": 1, "maximum": 5 },
        "thumbs_up_count": { "type": "integer", "minimum": 0 },
        "review_created_at": { "type": "string" },
        "app_version": { "type": "string" },
        "device": { "type": "string" },
        "os_version": { "type": "string" },
        "locale": { "type": "string" },
        "reply_content": { "type": "string" },
        "reply_created_at": { "type": "string" }
      },
      "required": ["review_id", "content", "score"],
      "additionalProperties": true
    },

    "IssueType": {
      "type": "string",
      "enum": [
        "Bug",
        "Performance",
        "UX",
        "Feature Request",
        "Account/Auth",
        "Billing/Pricing",
        "Safety Concern",
        "Praise",
        "Spam / Bot / Irrelevant"
      ]
    },

    "FeatureArea": {
      "type": "string",
      "enum": [
        "Crash Detection",
        "Driving Reports",
        "Family Location",
        "SOS",
        "Card Controls",
        "Allowance/Chores",
        "Savings/Investing",
        "Bank Linking",
        "Notifications",
        "Onboarding",
        "Login/OTP",
        "Other",
        "Unknown"
      ]
    },

    "Severity": { "type": "string", "enum": ["P0", "P1", "P2", "FYI"] },

    "Sentiment": { "type": "string", "enum": ["Positive", "Mixed", "Neutral", "Negative"] },

    "ClassificationSource": { "type": "string", "enum": ["rule_engine", "llm", "hybrid"] },

    "Error": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string",
          "enum": [
            "INPUT_TOO_LARGE",
            "INVALID_SCHEMA",
            "FILE_NOT_FOUND",
            "RATE_LIMITED",
            "CIRCUIT_BREAKER_TRIPPED",
            "TIMEOUT",
            "INTERNAL"
          ]
        },
        "message": { "type": "string" },
        "details": { "type": "object" }
      },
      "required": ["code", "message"],
      "additionalProperties": false
    },

    "Metadata": {
      "type": "object",
      "properties": {
        "schema_version": { "type": "string" },
        "rules_version": { "type": "string" },
        "taxonomy_version": { "type": "string" },
        "models_used": {
          "type": "object",
          "properties": {
            "routing": { "type": "string" },
            "summary": { "type": "string" }
          },
          "required": ["routing", "summary"],
          "additionalProperties": false
        },
        "pii_redaction_engine": { "type": "string" },

        "processed_at": { "type": "string" },
        "total_reviews_input": { "type": "integer" },
        "filtered_spam": { "type": "integer" },
        "spam_ratio": { "type": "number" },
        "total_processed": { "type": "integer" },

        "llm_routed_count": { "type": "integer" },
        "llm_routed_ratio": { "type": "number" },
        "rule_only_count": { "type": "integer" },
        "hybrid_count": { "type": "integer" },

        "rule_coverage_drop": { "type": "boolean" },
        "warnings": { "type": "array", "items": { "type": "string" } },

        "rate_limit_count": { "type": "integer" },
        "retry_count": { "type": "integer" },
        "timeout_count": { "type": "integer" },

        "cost_estimate_usd": { "type": "number" },
        "execution_time_ms": { "type": "integer" }
      },
      "required": [
        "schema_version",
        "rules_version",
        "taxonomy_version",
        "models_used",
        "pii_redaction_engine",
        "processed_at",
        "total_reviews_input",
        "filtered_spam",
        "spam_ratio",
        "total_processed",
        "llm_routed_count",
        "llm_routed_ratio",
        "rule_only_count",
        "hybrid_count",
        "rule_coverage_drop",
        "warnings",
        "rate_limit_count",
        "retry_count",
        "timeout_count",
        "cost_estimate_usd",
        "execution_time_ms"
      ],
      "additionalProperties": false
    }
  }
}
```

## Tool Schemas

### 1) reviews.import
```json
{
  "$id": "reviews.import.schema.json",
  "type": "object",
  "properties": {
    "source": { "$ref": "shared.types.schema.json#/definitions/Source" },
    "options": {
      "type": "object",
      "properties": {
        "max_reviews": { "type": "integer", "maximum": 5000, "default": 5000 }
      },
      "additionalProperties": false
    }
  },
  "required": ["source"],
  "additionalProperties": false
}
```
**Response (success):**
```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "metadata": { "$ref": "shared.types.schema.json#/definitions/Metadata" },
        "reviews": {
          "type": "array",
          "items": {
            "allOf": [
              { "$ref": "shared.types.schema.json#/definitions/ReviewInput" },
              {
                "type": "object",
                "properties": {
                  "content_redacted": { "type": "string" }
                },
                "required": ["content_redacted"]
              }
            ]
          }
        }
      },
      "required": ["metadata", "reviews"]
    }
  },
  "required": ["data"],
  "additionalProperties": false
}
```

### 2) reviews.analyze
```json
{
  "$id": "reviews.analyze.schema.json",
  "type": "object",
  "properties": {
    "source": { "$ref": "shared.types.schema.json#/definitions/Source" },
    "options": {
      "type": "object",
      "properties": {
        "budget_usd": { "type": "number" },
        "concurrency": { "type": "integer", "minimum": 1, "maximum": 20, "default": 15 },
        "routing_model": { "type": "string" },
        "summary_model": { "type": "string" },
        "include_summary": { "type": "boolean", "default": false }
      },
      "additionalProperties": false
    }
  },
  "required": ["source"],
  "additionalProperties": false
}
```
**Response (success):**
```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "metadata": { "$ref": "shared.types.schema.json#/definitions/Metadata" },
        "safety_alerts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "review_id": { "type": "string" },
              "text": { "type": "string" },
              "feature_area": { "$ref": "shared.types.schema.json#/definitions/FeatureArea" },
              "severity": { "$ref": "shared.types.schema.json#/definitions/Severity" },
              "requires_immediate_attention": { "type": "boolean" }
            },
            "required": ["review_id", "text", "feature_area", "severity", "requires_immediate_attention"],
            "additionalProperties": false
          }
        },
        "reviews": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "review_id": { "type": "string" },
              "issue_type": { "$ref": "shared.types.schema.json#/definitions/IssueType" },
              "feature_area": { "$ref": "shared.types.schema.json#/definitions/FeatureArea" },
              "severity": { "$ref": "shared.types.schema.json#/definitions/Severity" },
              "sentiment": { "$ref": "shared.types.schema.json#/definitions/Sentiment" },
              "confidence_score": { "type": "number", "minimum": 0, "maximum": 1 },
              "classification_source": { "$ref": "shared.types.schema.json#/definitions/ClassificationSource" },
              "signals": {
                "type": "object",
                "properties": {
                  "summary": { "type": "string" },
                  "repro_hints": { "type": "array", "items": { "type": "string" } },
                  "device": { "type": "string" },
                  "os_version": { "type": "string" },
                  "app_version": { "type": "string" },
                  "feature_mentions": { "type": "array", "items": { "type": "string" } }
                },
                "additionalProperties": false
              }
            },
            "required": [
              "review_id",
              "issue_type",
              "feature_area",
              "severity",
              "sentiment",
              "confidence_score",
              "classification_source",
              "signals"
            ],
            "additionalProperties": false
          }
        },
        "summary": {
          "type": "object",
          "properties": {
            "top_themes": { "type": "array", "items": { "type": "string" } },
            "p0_count": { "type": "integer" },
            "p1_count": { "type": "integer" },
            "p2_count": { "type": "integer" },
            "fyi_count": { "type": "integer" }
          },
          "required": ["top_themes", "p0_count", "p1_count", "p2_count", "fyi_count"],
          "additionalProperties": false
        }
      },
      "required": ["metadata", "safety_alerts", "reviews"],
      "additionalProperties": false
    }
  },
  "required": ["data"],
  "additionalProperties": false
}
```

### 3) reviews.get_safety_alerts
*Same input as `reviews.analyze`, but returns ONLY metadata + `safety_alerts`.*

### 4) reviews.top_issues (`reviews_top_issues` in current runtime)
```json
{
  "$id": "reviews.top_issues.schema.json",
  "type": "object",
  "properties": {
    "reviews": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "review_id": { "type": "string" },
          "issue_type": { "$ref": "shared.types.schema.json#/definitions/IssueType" },
          "feature_area": { "$ref": "shared.types.schema.json#/definitions/FeatureArea" },
          "severity": { "$ref": "shared.types.schema.json#/definitions/Severity" },
          "sentiment": { "$ref": "shared.types.schema.json#/definitions/Sentiment" },
          "review_created_at": { "type": "string" },
          "score": { "type": "integer", "minimum": 1, "maximum": 5 }
        },
        "required": ["review_id", "issue_type", "feature_area"],
        "additionalProperties": true
      }
    },
    "options": {
      "type": "object",
      "properties": {
        "limit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 10 },
        "filters": {
          "type": "object",
          "properties": {
            "start_date": { "type": "string" },
            "end_date": { "type": "string" },
            "severities": { "type": "array", "items": { "type": "string" } },
            "sentiments": { "type": "array", "items": { "type": "string" } },
            "feature_areas": { "type": "array", "items": { "type": "string" } },
            "issue_types": { "type": "array", "items": { "type": "string" } }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    }
  },
  "required": ["reviews"],
  "additionalProperties": false
}
```

### 5) reviews.segment_breakdown (`reviews_segment_breakdown` in current runtime)
```json
{
  "$id": "reviews.segment_breakdown.schema.json",
  "type": "object",
  "properties": {
    "reviews": {
      "type": "array",
      "items": { "type": "object" }
    },
    "options": {
      "type": "object",
      "properties": {
        "dimension": {
          "type": "string",
          "enum": ["app_version", "os_version", "device", "locale", "platform", "rating_bucket"]
        },
        "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 10 },
        "filters": { "type": "object" }
      },
      "required": ["dimension"],
      "additionalProperties": false
    }
  },
  "required": ["reviews", "options"],
  "additionalProperties": false
}
```

### 6) reviews.time_trends (`reviews_time_trends` in current runtime)
```json
{
  "$id": "reviews.time_trends.schema.json",
  "type": "object",
  "properties": {
    "reviews": {
      "type": "array",
      "items": { "type": "object" }
    },
    "options": {
      "type": "object",
      "properties": {
        "bucket": { "type": "string", "enum": ["day", "week"], "default": "week" },
        "top_issue_limit": { "type": "integer", "minimum": 1, "maximum": 10, "default": 3 },
        "filters": { "type": "object" }
      },
      "additionalProperties": false
    }
  },
  "required": ["reviews"],
  "additionalProperties": false
}
```

### 7) Error response (all tools)
```json
{
  "type": "object",
  "properties": {
    "error": { "$ref": "shared.types.schema.json#/definitions/Error" }
  },
  "required": ["error"],
  "additionalProperties": false
}
```

## Runtime Naming Note
The current server runtime uses underscore tool names (for example `reviews_top_issues`) while parts of this spec use dotted naming (for example `reviews.top_issues`). Keep your MCP client aligned to the runtime names listed by `ListTools` until naming is unified.
