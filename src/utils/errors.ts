import { ErrorCodeEnum } from "../schemas/shared.js";
import { z } from "zod";

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly details?: Record<string, unknown>;

    constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown) {
        super(message, cause !== undefined ? { cause } : undefined);
        this.name = "AppError";
        this.code = code;
        this.details = details;
    }
}

export function createError(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    return new AppError(code, message, details);
}
