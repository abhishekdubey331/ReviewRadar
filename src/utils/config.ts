import { z } from 'zod';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createError } from './errors.js';

let loadedEnvPath: string | null = null;

// Parse .env from resilient candidate paths because MCP hosts may start the server with arbitrary CWD.
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRootEnv = path.resolve(__dirname, '../../.env');
    const envCandidates = [
        projectRootEnv, // deterministic for both src/utils and dist/utils
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '../.env') // legacy fallback
    ];

    for (const envPath of envCandidates) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath, override: true, quiet: true } as any);
            loadedEnvPath = envPath;
            break;
        }
    }
} catch {
    // silently continue
}

export const configSchema = z.object({
    APP_LINK: z.string().url("APP_LINK must be a valid URL"),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    MAX_BATCH_BUDGET_USD: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid currency amount").default("5.00")
}).refine(data => data.OPENAI_API_KEY || data.ANTHROPIC_API_KEY, {
    message: "Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be provided",
    path: ["OPENAI_API_KEY"]
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return configSchema.parse(env);
}

export function getConfigDiagnostics() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const envCandidates = [
        path.resolve(__dirname, '../../.env'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '../.env')
    ];

    return {
        process_cwd: process.cwd(),
        loaded_env_path: loadedEnvPath,
        env_candidates: envCandidates.map((p) => ({ path: p, exists: fs.existsSync(p) })),
        has_openai_key: Boolean(process.env.OPENAI_API_KEY),
        has_anthropic_key: Boolean(process.env.ANTHROPIC_API_KEY),
        configured_provider: process.env.OPENAI_API_KEY ? 'openai' : (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none')
    };
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
    if (cachedConfig) return cachedConfig;

    try {
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
