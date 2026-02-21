import { IssueTypeEnum, FeatureAreaEnum, SeverityEnum, SentimentEnum } from '../schemas/shared.js';
import { z } from 'zod';

export type IssueType = z.infer<typeof IssueTypeEnum>;
export type FeatureArea = z.infer<typeof FeatureAreaEnum>;
export type Severity = z.infer<typeof SeverityEnum>;
export type Sentiment = z.infer<typeof SentimentEnum>;

export interface RuleResult {
    issue_type: IssueType | "Unknown";
    feature_area: FeatureArea;
    severity?: Severity;
    sentiment?: Sentiment;
    confidence_score: number;
    classification_source: "rule_engine" | "llm" | "hybrid";
    is_spam: boolean;
}

export function evaluateRules(content: string, rating: number): RuleResult {
    const textLower = content.toLowerCase();

    // Commit 5: Low-signal / Spam Filter
    const alphaCount = (content.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount < 10) {
        return {
            issue_type: "Spam / Bot / Irrelevant",
            feature_area: "Other",
            severity: "FYI",
            sentiment: "Neutral",
            confidence_score: 1.0,
            classification_source: "rule_engine",
            is_spam: true
        };
    }

    // Commit 5: Keyword Heuristics for FeatureArea mapping
    let feature_area: FeatureArea = "Unknown";
    let featureScore = 0.0;

    const featureKeywords = [
        { area: "Crash Detection", keywords: ["crash detection", "detect crash", "car accident"] },
        { area: "Driving Reports", keywords: ["driving report", "speeding rule", "driving score"] },
        { area: "Family Location", keywords: ["location sharing", "family location", "gps tracker", "where is my kid", "location not updating"] },
        { area: "SOS", keywords: ["sos", "emergency alert"] },
        { area: "Card Controls", keywords: ["card controls", "freeze card", "lock card", "card toggle"] },
        { area: "Allowance/Chores", keywords: ["allowance", "chores", "task"] },
        { area: "Savings/Investing", keywords: ["savings", "investing", "stock"] },
        { area: "Bank Linking", keywords: ["bank link", "plaid", "link account", "deposit"] },
        { area: "Notifications", keywords: ["notifications", "push alert"] },
        { area: "Onboarding", keywords: ["onboarding", "sign up", "registration"] },
        { area: "Login/OTP", keywords: ["login", "otp", "code", "password", "can't login", "cannot login"] }
    ] as const;

    for (const mapping of featureKeywords) {
        for (const keyword of mapping.keywords) {
            if (textLower.includes(keyword)) {
                feature_area = mapping.area as FeatureArea;
                featureScore = 0.8;
                break;
            }
        }
        if (feature_area !== "Unknown") break;
    }

    // Issue Type Heuristics
    let issue_type: IssueType | "Unknown" = "Unknown";
    let issueScore = 0.0;

    if (textLower.includes("bug") || textLower.includes("error")) {
        issue_type = "Bug"; issueScore = 0.7;
    } else if (textLower.includes("slow") || textLower.includes("lag") || textLower.includes("freeze")) {
        issue_type = "Performance"; issueScore = 0.7;
    } else if (textLower.includes("feature request") || textLower.includes("wish")) {
        issue_type = "Feature Request"; issueScore = 0.8;
    } else if (textLower.includes("charge") || textLower.includes("refund") || textLower.includes("billing")) {
        issue_type = "Billing/Pricing"; issueScore = 0.8;
    } else if (textLower.includes("safety") || textLower.includes("alert failed") || textLower.includes("stranger")) {
        issue_type = "Safety Concern"; issueScore = 0.9;
    }

    // Sentiment (Heuristic)
    let sentiment: Sentiment | undefined = undefined;
    let sentimentScore = 0.0;
    if (rating >= 4) {
        sentiment = "Positive"; sentimentScore = 0.8;
    } else if (rating === 3) {
        sentiment = "Neutral"; sentimentScore = 0.6;
    } else if (rating <= 2) {
        sentiment = "Negative"; sentimentScore = 0.8;
    }

    // Commit 6: Severity Precedence
    let severity: Severity | undefined = undefined;
    const CRITICAL_PHRASES = ["can't login", "cannot login", "login failed", "account blocked", "money missing", "charged", "payment failed", "crashed on startup", "app won't open", "stuck on loading"];
    const SAFETY_FAILURE_PHRASES = ["crash detection not working", "didn't detect crash", "no alert sent", "location not updating", "stopped sharing location", "sos not working", "emergency alert failed", "not getting notifications"];
    const SAFETY_BROKEN_KEYWORDS = ["not working", "stopped", "fails", "failed", "broken"];

    const hasCriticalPhrase = CRITICAL_PHRASES.some(p => textLower.includes(p));
    const hasP0Fraud = rating <= 2 && ["scam", "fraud", "stole", "unauthorized"].some(w => textLower.includes(w));

    // P0 - Critical
    if (hasCriticalPhrase || hasP0Fraud) {
        severity = "P0";
        issueScore = 0.9;
        if (issue_type === "Unknown") issue_type = "Bug"; // provide baseline
    }
    // P0 - Safety Failure
    else {
        let isSafetyFailure = false;

        if (issue_type === "Safety Concern" || SAFETY_FAILURE_PHRASES.some(p => textLower.includes(p))) {
            isSafetyFailure = true;
        } else if (["Crash Detection", "Family Location", "SOS"].includes(feature_area) && sentiment === "Negative") {
            const mentionsSafetyFeature = ["crash detection", "location", "gps", "sos", "alert"].some(w => textLower.includes(w));
            if (SAFETY_BROKEN_KEYWORDS.some(w => textLower.includes(w)) && mentionsSafetyFeature) {
                isSafetyFailure = true;
            }
        }

        if (isSafetyFailure) {
            severity = "P0";
            issueScore = 0.95;
            issue_type = "Safety Concern";
        }
    }

    if (!severity) {
        if ((issue_type === "Bug" && rating <= 3 && sentiment === "Negative") ||
            (["Performance", "Unknown"].includes(issue_type) && ["crash", "freeze", "lag", "hang"].some(w => textLower.includes(w)) && rating <= 3)) {
            severity = "P1";
            issueScore = 0.85;
            if (issue_type === "Unknown") issue_type = "Performance";
        }
        else if (rating === 4 || sentiment === "Neutral") {
            severity = "P2";
            issueScore = 0.7;
        }
        else if (rating >= 4 || textLower.includes("thanks") || textLower.includes("love") || textLower.includes("good")) {
            severity = "FYI";
            issue_type = (issue_type === "Unknown") ? "Praise" : issue_type;
            sentiment = "Positive";
            issueScore = Math.max(issueScore, 0.7);
        }
    }

    let rule_confidence = Math.max(featureScore, issueScore, sentimentScore);

    return {
        issue_type: issue_type as IssueType | "Unknown",
        feature_area,
        severity,
        sentiment: sentiment as Sentiment,
        confidence_score: rule_confidence,
        classification_source: "rule_engine",
        is_spam: false
    };
}
