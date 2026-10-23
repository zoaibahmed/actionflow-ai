import "server-only";
import OpenAI from "openai";
export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
// One server-side transport for Capture and Dayflow. No automatic paid retries.
export function createAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Math.min(
      55000,
      Math.max(1000, Number(process.env.CAPTURE_TIMEOUT_MS) || 55000),
    ),
    maxRetries: 0,
  });
}
