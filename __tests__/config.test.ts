import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { configSchema, parseConfig, isPlayStoreLink, isAppStoreLink, extractAppId, getConfigDiagnostics } from '../src/utils/config.js';

describe('Configuration Validation', () => {

    it('should validate a valid Play Store URL and API key', () => {
        const result = configSchema.safeParse({
            APP_LINK: 'https://play.google.com/store/apps/details?id=com.whatsapp',
            OPENAI_API_KEY: 'sk-123'
        });
        expect(result.success).toBe(true);
    });

    it('should validate a valid App Store URL and Anthropic API key', () => {
        const result = configSchema.safeParse({
            APP_LINK: 'https://apps.apple.com/us/app/whatsapp/id310633997',
            ANTHROPIC_API_KEY: 'sk-ant-123'
        });
        expect(result.success).toBe(true);
    });

    it('should fail if no API key is provided', () => {
        const result = configSchema.safeParse({
            APP_LINK: 'https://play.google.com/store/apps/details?id=com.whatsapp'
        });
        expect(result.success).toBe(false);
    });

    it('should fail if APP_LINK is missing or invalid', () => {
        const result = configSchema.safeParse({
            OPENAI_API_KEY: 'sk-123',
            APP_LINK: 'not-a-url'
        });
        expect(result.success).toBe(false);
    });

    it('parseConfig throws zod error for invalid env', () => {
        expect(() => parseConfig({ APP_LINK: 'invalid-url' } as NodeJS.ProcessEnv)).toThrow(z.ZodError);
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
    });
});
