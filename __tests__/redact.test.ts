import { describe, it, expect } from 'vitest';
import { redactPII } from '../src/utils/redact.js';

describe('PII Redaction Engine', () => {
    it('should redact emails', () => {
        expect(redactPII("Please contact me at test@example.com for info.")).toBe("Please contact me at [REDACTED] for info.");
        expect(redactPII("Emails: a.b@c.net, user-name@domain.co.uk")).toBe("Emails: [REDACTED], [REDACTED]");
    });

    it('should redact phone numbers', () => {
        expect(redactPII("Call me maybe 1-800-555-0199.")).toBe("Call me maybe [REDACTED].");
        expect(redactPII("Here is my cell (415) 555-0198 or +1 415 555 0197")).toBe("Here is my cell [REDACTED] or [REDACTED]");
        expect(redactPII("My number is 123.456.7890")).toBe("My number is [REDACTED]");
    });

    it('should redact coordinates', () => {
        expect(redactPII("I got stuck at 37.7749, -122.4194 instead of home.")).toBe("I got stuck at [REDACTED] instead of home.");
        expect(redactPII("Coords: -33.8688,151.2093")).toBe("Coords: [REDACTED]");
    });

    it('should handle zero leaks when multiple types are present', () => {
        const raw = "I am at 40.7128, -74.0060 and my phone is (212) 555-1234. Email john_doe123@nyc.gov";
        const expected = "I am at [REDACTED] and my phone is [REDACTED]. Email [REDACTED]";
        expect(redactPII(raw)).toBe(expected);
    });

    it('should not mutate string without PII', () => {
        const standard = "The app keeps crashing when I open the bank linking tab.";
        expect(redactPII(standard)).toBe(standard);
    });
});
