import { ErrorCodeEnum } from "../schemas/shared.js";
import { z } from "zod";

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

export function createError(code: ErrorCode, message: string, details?: Record<string, any>) {
    const err: any = { code, message };
    if (details) {
        err.details = details;
    }
    return err;
}
