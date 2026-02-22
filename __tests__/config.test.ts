import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { configSchema, parseConfig, parseScrapeConfig, isPlayStoreLink, isAppStoreLink, extractAppId, getConfigDiagnostics, resolveStorageDir } from '../src/utils/config.js';
import path from 'path';

describe('Configuration Validation', () => {

    it('should validate runtime config with OpenAI key', () => {
        const result = configSchema.safeParse({
            OPENAI_API_KEY: 'sk-123'
        });
        expect(result.success).toBe(true);
    });

    it('should validate runtime config with Anthropic key', () => {
        const result = configSchema.safeParse({
            ANTHROPIC_API_KEY: 'sk-ant-123'
        });
        expect(result.success).toBe(true);
    });

    it('should fail if no API key is provided', () => {
        const result = configSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('parseScrapeConfig validates APP_LINK separately for scraper flows', () => {
        const result = parseScrapeConfig({
            APP_LINK: 'https://play.google.com/store/apps/details?id=com.whatsapp'
        } as NodeJS.ProcessEnv);
        expect(result.APP_LINK).toContain('play.google.com');
    });

    it('parseScrapeConfig fails with invalid APP_LINK', () => {
        expect(() => parseScrapeConfig({ APP_LINK: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow(z.ZodError);
    });

    it('parseConfig throws zod error for missing runtime keys', () => {
        expect(() => parseConfig({} as NodeJS.ProcessEnv)).toThrow(z.ZodError);
    });

    it('runtime parseConfig does not require APP_LINK', () => {
        const result = parseConfig({ OPENAI_API_KEY: 'sk-123' } as NodeJS.ProcessEnv);
        expect(result.OPENAI_API_KEY).toBe('sk-123');
    });

    it('runtime config rejects invalid budget format', () => {
        const result = configSchema.safeParse({
            OPENAI_API_KEY: 'sk-123',
            MAX_BATCH_BUDGET_USD: 'abc'
        });
        expect(result.success).toBe(false);
    });
});

describe('App ID Extraction', () => {
    it('identifies Play Store links', () => {
        expect(isPlayStoreLink('https://play.google.com/store/apps/details?id=com.whatsapp')).toBe(true);
        expect(isPlayStoreLink('https://apps.apple.com/us/app/whatsapp/id310633997')).toBe(false);
    });

    it('identifies App Store links', () => {
        expect(isAppStoreLink('https://apps.apple.com/us/app/whatsapp/id310633997')).toBe(true);
        expect(isAppStoreLink('https://play.google.com/store/apps/details?id=com.whatsapp')).toBe(false);
    });

    it('extracts Android bundle ID', () => {
        expect(extractAppId('https://play.google.com/store/apps/details?id=com.whatsapp')).toBe('com.whatsapp');
    });

    it('extracts iOS Apple ID', () => {
        expect(extractAppId('https://apps.apple.com/us/app/whatsapp/id310633997')).toBe('310633997');
    });

    it('throws error on unsupported URL', () => {
        expect(() => extractAppId('https://google.com')).toThrowError("Unsupported App Link format");
    });
});

describe('Configuration diagnostics', () => {
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

    afterEach(() => {
        if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalOpenAIKey;

        if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    });

    it('does not expose API key previews in diagnostics', () => {
        process.env.OPENAI_API_KEY = 'sk-test-exposed-secret';
        delete process.env.ANTHROPIC_API_KEY;

        const diagnostics = getConfigDiagnostics() as Record<string, unknown>;
        expect(diagnostics.has_openai_key).toBe(true);
        expect(diagnostics.configured_provider).toBe('openai');
        expect(diagnostics).not.toHaveProperty('openai_key_preview');
        expect(typeof diagnostics.resolved_storage_dir).toBe('string');
    });

    it('resolves relative storage directory from project root', () => {
        const resolved = resolveStorageDir('storage');
        expect(path.isAbsolute(resolved)).toBe(true);
        expect(resolved.endsWith('storage')).toBe(true);
    });
});
