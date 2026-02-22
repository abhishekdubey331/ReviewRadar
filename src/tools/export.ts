import { z } from 'zod';
import { createError } from '../utils/errors.js';
import { SeverityEnum, SentimentEnum } from '../schemas/shared.js';

export interface AnalyzedReviewForExport {
    review_id: string;
    issue_type: string;
    feature_area: string;
    severity: z.infer<typeof SeverityEnum>;
    sentiment: z.infer<typeof SentimentEnum>;
    signals: {
        summary?: string;
        device?: string;
        os_version?: string;
        app_version?: string;
    };
}

const ExportReviewSchema = z.object({
    review_id: z.string().min(1),
    issue_type: z.string().min(1).max(100),
    feature_area: z.string().min(1).max(100),
    severity: SeverityEnum,
    sentiment: SentimentEnum,
    signals: z.object({
        summary: z.string().max(5000).optional(),
        device: z.string().max(200).optional(),
        os_version: z.string().max(200).optional(),
        app_version: z.string().max(200).optional(),
    }).strict().default({})
}).strict();

export function generateSlackMarkdown(reviews: AnalyzedReviewForExport[]): string {
    if (!reviews || reviews.length === 0) return '*No reviews to report.*';

    let md = '*App Reviews Report*\n\n';

    const p0s = reviews.filter((r) => r.severity === 'P0');
    const p1s = reviews.filter((r) => r.severity === 'P1');

    if (p0s.length > 0) {
        md += `*P0 Critical Issues (${p0s.length})*\n`;
        p0s.forEach((r) => {
            md += `- *[${r.feature_area}]* ${r.issue_type} (ID: ${r.review_id})\n`;
        });
        md += '\n';
    }

    if (p1s.length > 0) {
        md += `*P1 High Priority (${p1s.length})*\n`;
        p1s.forEach((r) => {
            md += `- *[${r.feature_area}]* ${r.issue_type} (ID: ${r.review_id})\n`;
        });
        md += '\n';
    }

    const others = reviews.filter((r) => r.severity !== 'P0' && r.severity !== 'P1');
    if (others.length > 0) {
        md += `*Other Reports (${others.length})*\n`;
        others.forEach((r) => {
            md += `- [${r.severity}] ${r.feature_area} - ${r.issue_type}\n`;
        });
    }

    return md.trim();
}

export function generateJiraPayload(reviews: AnalyzedReviewForExport[]) {
    return reviews.map((r) => {
        const title = `[${r.severity}] ${r.feature_area}: ${r.issue_type} Report`;

        let desc = '*Automated Review Ticket*\n';
        desc += `Review ID: ${r.review_id}\n`;
        desc += `Severity: ${r.severity}\n`;
        desc += `Feature Area: ${r.feature_area}\n`;
        desc += `Sentiment: ${r.sentiment}\n`;

        if (r.signals.device) desc += `Device: ${r.signals.device}\n`;
        if (r.signals.os_version) desc += `OS: ${r.signals.os_version}\n`;
        if (r.signals.app_version) desc += `App Version: ${r.signals.app_version}\n`;

        return {
            fields: {
                project: { key: 'APP' },
                summary: title,
                description: desc,
                issuetype: { name: r.issue_type === 'Bug' ? 'Bug' : 'Task' },
                customfield_severity: r.severity
            }
        };
    });
}

export const ExportToolSchema = z.object({
    format: z.enum(['markdown', 'jira']),
    reviews: z.array(ExportReviewSchema).max(5000)
}).strict();

export async function exportTool(input: unknown) {
    const parseRes = ExportToolSchema.safeParse(input);
    if (!parseRes.success) {
        throw createError('INVALID_SCHEMA', 'Invalid export parameters', parseRes.error.format());
    }

    const { format, reviews } = parseRes.data;

    if (format === 'markdown') {
        const md = generateSlackMarkdown(reviews);
        return { data: { output: md } };
    }

    const payloads = generateJiraPayload(reviews);
    return { data: { output: payloads } };
}
