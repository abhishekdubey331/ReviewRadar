export function redactPII(content: string): string {
    if (!content) return content;

    let redacted = content;

    // Redact Emails
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;
    redacted = redacted.replace(emailRegex, "[REDACTED]");

    // Redact Phone Numbers (US/International simplified format)
    // e.g. +1-800-555-0199, (800) 555-0199, 800-555-0199, 123.456.7890
    const phoneRegex = /(?:\+?\d{1,3}[ \-.]?)?\(?\d{3}\)?[ \-.]?\d{3}[ \-.]?\d{4}/g;
    redacted = redacted.replace(phoneRegex, "[REDACTED]");

    // Redact Coordinates (Latitude, Longitude)
    // Matches floating points with a comma in between
    const coordRegex = /[-+]?\d{1,2}\.?\d*,\s*[-+]?\d{1,3}\.?\d*/g;
    redacted = redacted.replace(coordRegex, "[REDACTED]");

    return redacted;
}
