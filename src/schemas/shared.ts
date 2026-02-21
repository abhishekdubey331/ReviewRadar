import { z } from "zod";

export const IssueTypeEnum = z.enum([
    "Bug",
    "Performance",
    "UX",
    "Feature Request",
    "Account/Auth",
    "Billing/Pricing",
    "Safety Concern",
    "Praise",
    "Spam / Bot / Irrelevant"
]);

export const FeatureAreaEnum = z.enum([
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
]);

export const SeverityEnum = z.enum(["P0", "P1", "P2", "FYI"]);

export const SentimentEnum = z.enum(["Positive", "Mixed", "Neutral", "Negative"]);

export const ClassificationSourceEnum = z.enum(["rule_engine", "llm", "hybrid"]);

export const ErrorCodeEnum = z.enum([
    "INPUT_TOO_LARGE",
    "INVALID_SCHEMA",
    "FILE_NOT_FOUND",
    "RATE_LIMITED",
    "CIRCUIT_BREAKER_TRIPPED",
    "TIMEOUT",
    "INTERNAL"
]);

export const ErrorSchema = z.object({
    code: ErrorCodeEnum,
    message: z.string(),
    details: z.object({}).catchall(z.any()).optional(),
}).strict();

export const MetadataSchema = z.object({
    schema_version: z.string(),
    rules_version: z.string(),
    taxonomy_version: z.string(),
    models_used: z.object({
        routing: z.string(),
        summary: z.string(),
    }).strict(),
    pii_redaction_engine: z.string(),

    processed_at: z.string(),
    total_reviews_input: z.number().int(),
    filtered_spam: z.number().int(),
    spam_ratio: z.number(),
    total_processed: z.number().int(),

    llm_routed_count: z.number().int(),
    llm_routed_ratio: z.number(),
    rule_only_count: z.number().int(),
    hybrid_count: z.number().int(),

    rule_coverage_drop: z.boolean(),
    warnings: z.array(z.string()),

    rate_limit_count: z.number().int(),
    retry_count: z.number().int(),
    timeout_count: z.number().int(),

    cost_estimate_usd: z.number(),
    execution_time_ms: z.number().int()
}).strict();

export const ReviewInputSchema = z.object({
    review_id: z.string(),
    platform: z.enum(["play_store", "app_store", "unknown"]).optional(),
    user_name: z.string().optional(),
    content: z.string(),
    score: z.number().int().min(1).max(5),
    thumbs_up_count: z.number().int().min(0).optional(),
    review_created_at: z.string().optional(),
    app_version: z.string().optional(),
    device: z.string().optional(),
    os_version: z.string().optional(),
    locale: z.string().optional(),
    reply_content: z.string().optional(),
    reply_created_at: z.string().optional(),
}).passthrough();

export const SourceSchema = z.union([
    z.object({
        type: z.literal("file"),
        path: z.string().min(1),
    }).strict(),
    z.object({
        type: z.literal("inline"),
        reviews: z.array(z.lazy(() => ReviewInputSchema)).min(1).max(5000),
    }).strict(),
]);
