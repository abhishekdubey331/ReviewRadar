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

    // MCP stdio protocol uses stdout for framed JSON-RPC messages only.
    // Any diagnostic logging must go to stderr to avoid corrupting transport.
    console.error(line);
}

export const logger = {
    info: (event: string, fields?: LogFields) => emit("info", event, fields),
    warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
    error: (event: string, fields?: LogFields) => emit("error", event, fields)
};
