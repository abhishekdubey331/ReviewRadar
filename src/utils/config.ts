import { z } from 'zod';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { fileURLToPath } from 'url';

// Parse .env from the root filepath dynamically because Cursor's execution context is arbitrary
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const envPath = path.resolve(__dirname, '../.env');

    if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath, { encoding: 'utf8' }));
        for (const k in parsed) {
            if (!process.env.hasOwnProperty(k)) process.env[k] = parsed[k];
        }
    }
} catch (e) {
    // silently continue
}

export const configSchema = z.object({
    APP_LINK: z.string().url("APP_LINK must be a valid URL"),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    MAX_BATCH_BUDGET_USD: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid currency amount").default("5.00")
}).refine(data => data.OPENAI_API_KEY || data.ANTHROPIC_API_KEY, {
    message: "Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be provided",
    path: ["OPENAI_API_KEY"] // point error to one of the keys
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return configSchema.parse(env);
}

// Global cached config getter
let cachedConfig: Config | null = null;
export function getConfig(): Config {
    if (cachedConfig) return cachedConfig;

    try {
        cachedConfig = parseConfig();
        return cachedConfig;
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error("❌ Invalid Configuration (check your .env file):");
            error.errors.forEach((err) => {
                console.error(`- ${err.path.join('.')}: ${err.message}`);
            });
            process.exit(1);
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
        throw new Error("Could not extract numeric ID from App Store URL");
    }
    throw new Error("Unsupported App Link format. Must be Google Play or Apple App Store.");
}
