import { describe, expect, it } from "vitest";
import { spikeDetectionTool } from "./spike_detection.js";

describe("reviews_spike_detection", () => {
    it("detects issue spikes in latest bucket", async () => {
        const result = await spikeDetectionTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", review_created_at: "2026-02-01T10:00:00.000Z" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", review_created_at: "2026-02-02T10:00:00.000Z" },
                { review_id: "r3", issue_type: "Bug", feature_area: "Login/OTP", review_created_at: "2026-02-03T10:00:00.000Z" },
                { review_id: "r4", issue_type: "Bug", feature_area: "Login/OTP", review_created_at: "2026-02-03T11:00:00.000Z" },
                { review_id: "r5", issue_type: "Bug", feature_area: "Login/OTP", review_created_at: "2026-02-03T12:00:00.000Z" }
            ],
            options: { bucket: "day", spike_ratio_threshold: 2 }
        });

        expect(result.data.alerts.length).toBeGreaterThan(0);
        expect(result.data.alerts[0].issue_key).toBe("Bug::Login/OTP");
    });
});
