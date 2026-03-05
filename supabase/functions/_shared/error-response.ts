import { TenantGuardError } from "./tenant-guard.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EdgeFunctionError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorEnvelope {
  error: EdgeFunctionError;
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/** Build a typed JSON error response — never exposes raw Error or stack. */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  const body: ErrorEnvelope = {
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Catch-all handler for Edge Function top-level errors.
 * Maps known error types to structured responses;
 * unknown errors become opaque 500s.
 */
export function handleError(err: unknown): Response {
  if (err instanceof TenantGuardError) {
    return errorResponse(err.code, err.message, err.status);
  }
  if (err instanceof Error) {
    // Never leak the real message for unexpected errors in production.
    return errorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
  return errorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500);
}
