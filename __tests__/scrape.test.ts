import { describe, it, expect } from 'vitest';
// @ts-expect-error JavaScript scraper helpers are imported directly for unit coverage.
import { detectStoreProvider, extractStoreAppId, normalizeReviewDate, toCsvRows } from '../scripts/scrape_helpers.js';

describe('scrape helpers', () => {
    it('normalizes known review date fields', () => {
        const iso = normalizeReviewDate({ updated: '2025-12-31T12:00:00.000Z' });
        expect(iso).toBe('2025-12-31T12:00:00.000Z');
    });

    it('falls back to current time when date value is invalid', () => {
        const before = Date.now();
        const iso = normalizeReviewDate({ date: 'not-a-real-date' });
        const parsed = new Date(iso).getTime();

        expect(Number.isNaN(parsed)).toBe(false);
        expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    });

    it('writes normalized date into CSV rows', () => {
        const rows = toCsvRows([
            { id: 'r1', userName: 'u1', text: 'hello', score: 5, version: '1.0.0', date: '2025-01-01T00:00:00.000Z' }
        ], 'app_store');

        expect(rows).toHaveLength(2);
        expect(rows[1]).toContain('2025-01-01T00:00:00.000Z');
    });

    it('detects provider and extracts Play Store app id', () => {
        const appLink = 'https://play.google.com/store/apps/details?id=com.example.app';
        expect(detectStoreProvider(appLink)).toBe('play_store');
        expect(extractStoreAppId(appLink, 'play_store')).toBe('com.example.app');
    });

    it('detects provider and extracts App Store app id', () => {
        const appLink = 'https://apps.apple.com/us/app/example-app/id1234567890';
        expect(detectStoreProvider(appLink)).toBe('app_store');
        expect(extractStoreAppId(appLink, 'app_store')).toBe('1234567890');
    });
});
