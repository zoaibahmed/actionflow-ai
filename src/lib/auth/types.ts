export type AuthMode =
  "login" | "signup" | "forgot-password" | "reset-password";
export type AuthState = {
  error?: string;
  verificationEmail?: string;
  message?: string;
  fields?: Record<string, string[]>;
};
