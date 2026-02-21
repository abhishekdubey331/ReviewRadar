import { describe, it, expect } from 'vitest';
import { generateSlackMarkdown, generateJiraPayload } from './export.js';

describe('Export Formatters', () => {
    const mockReviews = [
        {
            review_id: "123",
            issue_type: "Bug",
            feature_area: "Login",
            severity: "P0",
            sentiment: "Negative",
            signals: { device: "iPhone", os_version: "16.1", app_version: "1.0" }
        },
        {
            review_id: "456",
            issue_type: "UX",
            feature_area: "Dashboard",
            severity: "P2",
            sentiment: "Neutral",
            signals: {}
        }
    ];

    it('generates Markdown correctly', () => {
        const md = generateSlackMarkdown(mockReviews);
        expect(md).toContain("*App Reviews Report*");
        expect(md).toContain("🚨 P0 Critical Issues (1)");
        expect(md.replace(/\s/g, '')).toContain("-*[Login]*Bug(ID:123)".replace(/\s/g, '')); // Just checking contents
        expect(md).toContain("ℹ️ Other Reports (1)");
    });

    it('generates Jira payload correctly', () => {
        const payloads = generateJiraPayload(mockReviews);
        expect(payloads.length).toBe(2);

        const first = payloads[0];
        expect(first.fields.project.key).toBe("APP");
        expect(first.fields.summary).toBe("[P0] Login: Bug Report");
        expect(first.fields.issuetype.name).toBe("Bug");
        expect(first.fields.description).toContain("Review ID: 123");
        expect(first.fields.description).toContain("Device: iPhone");

        const second = payloads[1];
        expect(second.fields.issuetype.name).toBe("Task");
    });
});
