type LogLevel = "info" | "warn" | "error";

interface LogFields {
    [key: string]: unknown;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        event,
        ...fields
    };
    const line = JSON.stringify(payload);

    if (level === "error" || level === "warn") {
        console.error(line);
        return;
    }
    console.log(line);
}

export const logger = {
    info: (event: string, fields?: LogFields) => emit("info", event, fields),
    warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
    error: (event: string, fields?: LogFields) => emit("error", event, fields)
};
