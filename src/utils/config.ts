import { z } from 'zod';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createError } from './errors.js';

let loadedEnvPath: string | null = null;
let envLoaded = false;

function resolveEnvCandidates() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return [
        path.resolve(__dirname, '../../.env'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '../.env')
    ];
}

export function loadEnv(options?: { override?: boolean; forceReload?: boolean }) {
    if (envLoaded && !options?.forceReload) {
        return loadedEnvPath;
    }

    const envCandidates = resolveEnvCandidates();
    for (const envPath of envCandidates) {
        if (!fs.existsSync(envPath)) continue;
        dotenv.config({
            path: envPath,
            override: options?.override ?? false,
            quiet: true
        } as any);
        loadedEnvPath = envPath;
        envLoaded = true;
        return loadedEnvPath;
    }

    envLoaded = true;
    loadedEnvPath = null;
    return null;
}

export const configSchema = z.object({
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_ROUTING_MODEL: z.string().min(1).default("gpt-4o-mini"),
    OPENAI_SUMMARY_MODEL: z.string().min(1).default("gpt-4o"),
    SUPPORT_BRAND_NAME: z.string().min(1).default("your app"),
    MAX_BATCH_BUDGET_USD: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid currency amount").default("5.00"),
    STORAGE_DIR: z.string().min(1).default("storage")
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return configSchema.parse(env);
}

export const scrapeConfigSchema = z.object({
    APP_LINK: z.string().url("APP_LINK must be a valid URL")
}).strict();

export type ScrapeConfig = z.infer<typeof scrapeConfigSchema>;

export function parseScrapeConfig(env: NodeJS.ProcessEnv = process.env): ScrapeConfig {
    return scrapeConfigSchema.parse(env);
}

export function getConfigDiagnostics() {
    const envCandidates = resolveEnvCandidates();

    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

    return {
        process_cwd: process.cwd(),
        loaded_env_path: loadedEnvPath,
        env_loaded: envLoaded,
        resolved_storage_dir: resolveStorageDir(process.env.STORAGE_DIR),
        env_candidates: envCandidates.map((p) => ({ path: p, exists: fs.existsSync(p) })),
        has_openai_key: hasOpenAI
    };
}

function getProjectRoot(): string {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.resolve(__dirname, "../..");
}

export function resolveStorageDir(storageDir?: string): string {
    const configured = storageDir?.trim() || "storage";
    return path.isAbsolute(configured)
        ? configured
        : path.resolve(getProjectRoot(), configured);
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
    if (cachedConfig) return cachedConfig;

    try {
        loadEnv();
        cachedConfig = parseConfig();
        return cachedConfig;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw createError('INVALID_SCHEMA', 'Invalid configuration (check your .env file)', {
                errors: error.errors.map((err) => ({
                    path: err.path.join('.'),
                    message: err.message
                }))
            });
        }
        throw error;
    }
}

export function resolveLlmProviderConfig(config: Config): {
    provider: "openai";
    routing_model: string;
    summary_model: string;
} {
    if (!config.OPENAI_API_KEY) {
        throw createError("INVALID_SCHEMA", "OPENAI_API_KEY is required");
    }
    return {
        provider: "openai",
        routing_model: config.OPENAI_ROUTING_MODEL,
        summary_model: config.OPENAI_SUMMARY_MODEL
    };
}

export function isPlayStoreLink(url: string): boolean {
    return url.includes('play.google.com');
}

export function isAppStoreLink(url: string): boolean {
    return url.includes('apps.apple.com');
}

export function extractAppId(url: string): string {
    if (isPlayStoreLink(url)) {
        try {
            const parsedUrl = new URL(url);
            const id = parsedUrl.searchParams.get('id');
            if (!id) throw new Error("No 'id' parameter found in Play Store URL");
            return id;
        } catch (e: any) {
            throw new Error(`Invalid Play Store URL: ${e.message}`);
        }
    } else if (isAppStoreLink(url)) {
        const match = url.match(/\/id(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        throw new Error('Could not extract numeric ID from App Store URL');
    }
    throw new Error('Unsupported App Link format. Must be Google Play or Apple App Store.');
}
