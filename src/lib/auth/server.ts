import "server-only";
import { createHmac } from "node:crypto";
import { after } from "next/server";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { nextCookies } from "better-auth/next-js";
import { getDatabase, getMongoClient } from "../db/mongo";
import { sendMail, sendAuthMail } from "./mail";
import { otpMail, resetMail } from "./email-templates";
import { authLimit, googleConfigured } from "./policy";
export function authConfigured() {
  return Boolean(
    process.env.MONGODB_URI &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL,
  );
}
export function verificationRequired() {
  return true;
}
const otpStorage = {
  hash: async (value: string) =>
    createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
      .update(value)
      .digest("hex"),
};
function buildAuth() {
  if (!authConfigured()) throw new Error("Authentication is not configured.");
  return betterAuth({
    appName: "ActionFlow AI",
    baseURL: process.env.BETTER_AUTH_URL!,
    secret: process.env.BETTER_AUTH_SECRET!,
    trustedOrigins: [new URL(process.env.BETTER_AUTH_URL!).origin],
    logger: { disabled: true },
    database: mongodbAdapter(getDatabase(), { client: getMongoClient() }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) => {
        const m = resetMail(url);
        // Keep SMTP latency/failure out of the account-enumeration response channel.
        after(async () => {
          try {
            await sendMail(user.email, m.subject, m.text, m.html);
          } catch {
            console.error(
              "ActionFlow password-recovery email delivery failed. Check transport configuration privately.",
            );
          }
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
    },
    socialProviders: googleConfigured()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            scope: ["openid", "email", "profile"],
            prompt: "select_account",
          },
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    session: {
      expiresIn: 604800,
      updateAge: 86400,
      cookieCache: { enabled: false },
      additionalFields: { authPolicyVersion: { type: "number", input: false } },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => ({
            data: { ...data, twoFactorEnabled: true },
          }),
        },
        update: {
          before: async (data) => ({
            data: { ...data, twoFactorEnabled: true },
          }),
        },
      },
      session: {
        create: {
          before: async (data, ctx) => {
            const user = await ctx?.context.internalAdapter.findUserById(
              data.userId,
            );
            if (!user?.emailVerified)
              throw new APIError("FORBIDDEN", {
                message: "Verify your email before signing in.",
                code: "EMAIL_NOT_VERIFIED",
              });
            return { data: { ...data, authPolicyVersion: 2 } };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path || "",
          body = ctx.body as Record<string, unknown> | undefined;
        for (const key of [
          "redirectTo",
          "callbackURL",
          "errorCallbackURL",
          "newUserCallbackURL",
        ]) {
          if (typeof body?.[key] === "string") {
            try {
              if (
                new URL(body[key] as string, process.env.BETTER_AUTH_URL)
                  .origin !== new URL(process.env.BETTER_AUTH_URL!).origin
              )
                throw new Error();
            } catch {
              throw new APIError("FORBIDDEN", {
                message: "Use an application redirect URL.",
              });
            }
          }
        }
        const forbidden =
          path === "/sign-in/email-otp" ||
          (path.startsWith("/email-otp/") &&
            ![
              "/email-otp/send-verification-otp",
              "/email-otp/verify-email",
            ].includes(path)) ||
          (path.startsWith("/two-factor/") &&
            !["/two-factor/send-otp", "/two-factor/verify-otp"].includes(path));
        if (forbidden)
          throw new APIError("FORBIDDEN", {
            message: "This authentication method is unavailable.",
            code: "AUTH_METHOD_DISABLED",
          });
        if (
          path === "/email-otp/send-verification-otp" &&
          body?.type !== "email-verification"
        )
          throw new APIError("FORBIDDEN", {
            message: "Only email verification is available here.",
          });
        if (
          ["/sign-in/social", "/link-social"].includes(path) &&
          (body?.provider !== "google" || body?.idToken)
        )
          throw new APIError("FORBIDDEN", {
            message: "Use the secure Google redirect flow.",
          });
        if (["/sign-in/social", "/link-social"].includes(path)) {
          if (
            body?.additionalParams ||
            (Array.isArray(body?.scopes) &&
              body.scopes.some(
                (s) => !["openid", "email", "profile"].includes(String(s)),
              ))
          )
            throw new APIError("FORBIDDEN", {
              message: "Only identity scopes are permitted.",
            });
        }
        if (path === "/sign-in/email") {
          const email = String(body?.email || "")
            .trim()
            .toLowerCase();
          await authLimit("password", email, 10, 60);
          const found =
            await ctx.context.internalAdapter.findUserByEmail(email);
          if (
            found &&
            !(found.user as { twoFactorEnabled?: boolean }).twoFactorEnabled
          )
            await ctx.context.internalAdapter.updateUser(found.user.id, {
              twoFactorEnabled: true,
            });
        }
        if (
          [
            "/email-otp/send-verification-otp",
            "/send-verification-email",
            "/request-password-reset",
            "/sign-up/email",
          ].includes(path)
        )
          await authLimit(
            path === "/request-password-reset"
              ? "reset-send"
              : "verification-send",
            String(body?.email || ""),
            1,
            60,
          );
        if (path === "/request-password-reset") {
          const found = await ctx.context.internalAdapter.findUserByEmail(
            String(body?.email || "")
              .trim()
              .toLowerCase(),
          );
          // Signup creates a user before email verification. That pending record
          // must not qualify for password recovery or receive reset links.
          if (found && !found.user.emailVerified) {
            await ctx.context.internalAdapter.findVerificationValue(
              "dummy-verification-token",
            );
            return ctx.json({
              status: true,
              message:
                "If this email exists in our system, check your email for the reset link",
            });
          }
        }
        if (path === "/reset-password" && typeof body?.token === "string") {
          const reset = await ctx.context.internalAdapter.findVerificationValue(
            "reset-password:" + body.token,
          );
          const user = reset
            ? await ctx.context.internalAdapter.findUserById(reset.value)
            : null;
          // Also reject links issued to unfinished signups before this policy.
          if (user && !user.emailVerified)
            throw new APIError("BAD_REQUEST", {
              message: "This reset link is invalid or expired.",
              code: "INVALID_TOKEN",
            });
        }
        if (path === "/email-otp/verify-email")
          await authLimit("verify-email", String(body?.email || ""), 10, 900);
        if (path.startsWith("/two-factor/")) {
          if (body?.trustDevice)
            throw new APIError("FORBIDDEN", {
              message:
                "A fresh email code is required for each password sign-in.",
            });
          const cookie = ctx.context.createAuthCookie("two_factor");
          const key = await ctx.getSignedCookie(
            cookie.name,
            ctx.context.secret,
          );
          const challenge = key
            ? await ctx.context.internalAdapter.findVerificationValue(key)
            : null;
          if (!challenge)
            throw new APIError("UNAUTHORIZED", {
              message: "Sign in with your password to request a code.",
              code: "INVALID_TWO_FACTOR_COOKIE",
            });
          await authLimit(
            path,
            challenge.value,
            path.endsWith("send-otp") ? 1 : 10,
            path.endsWith("send-otp") ? 60 : 900,
          );
        }
      }),
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 40 },
    advanced: {
      ipAddress: {
        ipAddressHeaders:
          process.env.NODE_ENV === "production"
            ? ["x-actionflow-client-ip"]
            : ["x-forwarded-for"],
      },
      useSecureCookies: process.env.BETTER_AUTH_URL!.startsWith("https://"),
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        storeOTP: otpStorage,
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "email-verification")
            throw new Error("Unsupported OTP purpose");
          const m = otpMail("registration", otp);
          await sendAuthMail(email, m.subject, m.text, m.html);
        },
      }),
      twoFactor({
        issuer: "ActionFlow AI",
        twoFactorCookieMaxAge: 600,
        totpOptions: { disable: true },
        otpOptions: {
          digits: 6,
          period: 5,
          allowedAttempts: 5,
          storeOTP: otpStorage,
          sendOTP: async ({ user, otp }) => {
            const m = otpMail("login", otp);
            await sendAuthMail(user.email, m.subject, m.text, m.html);
          },
        },
      }),
      nextCookies(),
    ],
  });
}
let instance: ReturnType<typeof buildAuth> | undefined;
export function getAuth() {
  return (instance ??= buildAuth());
}
