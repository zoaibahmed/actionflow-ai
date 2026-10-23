import { z } from "zod";
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email("Enter a valid email address.");
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use no more than 128 characters.");
export const taskIdSchema = z.string().uuid("Invalid task.");
export const taskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give your task a title.")
      .max(160, "Keep the title within 160 characters."),
    description: z
      .string()
      .trim()
      .max(2000, "Keep the description within 2,000 characters.")
      .nullable(),
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["todo", "in_progress", "done"]),
    due_at: z
      .string()
      .datetime({ offset: true, message: "Choose a valid date and time." })
      .nullable(),
  })
  .strict();
export function validationFields(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "form");
    (fields[name] ??= []).push(issue.message);
  }
  return fields;
}
