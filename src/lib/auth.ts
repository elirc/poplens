import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { getSms } from "@/adapters";

/**
 * Better Auth server instance: email+password, phone OTP (via the SMS
 * adapter — mock driver writes codes to the mock outbox), and organizations.
 * App roles live on user.role: 'user' | 'data_editor' | 'content_editor' | 'admin'.
 * Role changes happen only through the admin UI (server action), never from
 * client input (input: false).
 */
export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 60 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/phone-number/send-otp": { window: 60, max: 3 },
      // The header checks the session client-side on every page view; the
      // default 30/min trips under fast navigation (or an office NAT) and
      // makes signed-in users look signed out. Reads are cheap — be generous.
      "/get-session": { window: 60, max: 300 },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        await getSms().sendSms({
          to: phone,
          message: `Your PopLens verification code is ${code}`,
        });
      },
      signUpOnVerification: {
        getTempEmail: (phone) => `${phone.replace(/\D/g, "")}@phone.poplens.local`,
        getTempName: (phone) => phone,
      },
    }),
    organization(),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
