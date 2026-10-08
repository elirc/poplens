"use client";

import { createAuthClient } from "better-auth/react";
import {
  phoneNumberClient,
  organizationClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import type { auth } from "./auth";

/** Browser-side auth client. Import ONLY from client components. */
export const authClient = createAuthClient({
  plugins: [
    phoneNumberClient(),
    organizationClient(),
    inferAdditionalFields<typeof auth>(),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
