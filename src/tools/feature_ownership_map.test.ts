import { describe, expect, it } from "vitest";
import { featureOwnershipMapTool } from "./feature_ownership_map.js";

describe("reviews_feature_ownership_map", () => {
    it("maps issue clusters to owners and squads", async () => {
        const result = await featureOwnershipMapTool({
            reviews: [
                { review_id: "r1", issue_type: "Bug", feature_area: "Login/OTP", severity: "P1" },
                { review_id: "r2", issue_type: "Bug", feature_area: "Login/OTP", severity: "P0" },
                { review_id: "r3", issue_type: "Performance", feature_area: "Notifications", severity: "P2" }
            ],
            ownership_rules: [
                { feature_area: "Login/OTP", squad: "Identity", owner: "alice" }
            ]
        });

        expect(result.data.mappings.length).toBeGreaterThan(0);
        expect(result.data.mappings[0].squad).toBe("Identity");
    });
});
