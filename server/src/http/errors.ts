import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import type { ApiErrorBody } from "@asset-tracker/shared";

type ErrorCode = ApiErrorBody["error"]["code"];

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, "NOT_FOUND", `${what} not found`);

// Parse input with a zod schema, or throw a 400 listing every problem.
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new HttpError(
    400,
    "VALIDATION_ERROR",
    "Request is invalid",
    result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}

export const unknownRoute: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

// Every error leaves the API in the same shape: { error: { code, message, details? } }.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, details: err.details } };
    res.status(err.status).json(body);
    return;
  }
  // Malformed JSON body (thrown by express.json()).
  if (err?.type === "entity.parse.failed") {
    const body: ApiErrorBody = { error: { code: "VALIDATION_ERROR", message: "Body is not valid JSON" } };
    res.status(400).json(body);
    return;
  }
  // Anything else is a bug: log it, and don't leak internals to the client.
  console.error(err);
  const body: ApiErrorBody = { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } };
  res.status(500).json(body);
};
