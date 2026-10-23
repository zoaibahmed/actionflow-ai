export class CaptureError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function normalizeError(error: unknown): CaptureError {
  if (error instanceof CaptureError) return error;
  const e = error as { status?: number; name?: string };
  if (
    ["ZodError", "SyntaxError", "LengthFinishReasonError"].includes(
      e?.name || "",
    )
  )
    return new CaptureError(
      "model_output",
      "The AI response could not be validated. Nothing was saved. Please retry.",
      502,
    );
  if (e?.status === 401 || e?.status === 403)
    return new CaptureError(
      "provider_config",
      "AI access could not be verified. Check the server’s OpenAI configuration.",
      503,
    );
  if (e?.status === 429)
    return new CaptureError(
      "provider_limit",
      "The AI provider’s quota or rate limit was reached. Try again later or check billing.",
      429,
    );
  if (
    e?.name?.includes("Timeout") ||
    (error instanceof Error && error.constructor.name.includes("Timeout")) ||
    e?.name === "AbortError"
  )
    return new CaptureError(
      "timeout",
      "Analysis took too long. Your source is still here; you can retry.",
      504,
    );
  return new CaptureError(
    "unavailable",
    "We couldn’t complete this request. Your input is still here. Please try again.",
    503,
  );
}
