"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, Spinner } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Sign-in / sign-up forms (email+password and phone OTP) on Better Auth's
 * browser client. react-hook-form + Zod; the server re-validates and
 * rate-limits (/sign-in/email 5/min, /phone-number/send-otp 3/min).
 */

/** Nigerian mobile numbers: 080…, 234…, +234… → +234XXXXXXXXXX. */
export function normaliseNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  const m = /^(?:\+?234|0)([789][01]\d{8})$/.exec(digits);
  return m ? `+234${m[1]}` : null;
}

function goNext(next: string) {
  // Full navigation so server components (header, gates) see the new session.
  window.location.assign(next);
}

function errorText(e: { message?: string; status?: number } | null | undefined, fallback: string): string {
  if (!e) return fallback;
  if (e.status === 429) return "Too many attempts. Please wait a minute and try again.";
  return e.message || fallback;
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="text-xs text-red-700" role="alert">
      {message}
    </p>
  ) : null;
}

/* ── Email ───────────────────────────────────────────────────────────────── */

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

function EmailSignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema) });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const { error: e } = await authClient.signIn.email({ email: v.email, password: v.password });
    if (e) setError(errorText(e, "Email or password is incorrect"));
    else goNext(next);
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" autoComplete="email" {...form.register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-password">Password</Label>
        <Input id="si-password" type="password" autoComplete="current-password" {...form.register("password")} />
        <FieldError message={errors.password?.message} />
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner className="border-current border-t-transparent" /> : null}
        Sign in
      </Button>
    </form>
  );
}

const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80),
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

function EmailSignUp({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signUpSchema>>({ resolver: zodResolver(signUpSchema) });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const { error: e } = await authClient.signUp.email({ name: v.name, email: v.email, password: v.password });
    if (e) setError(errorText(e, "Could not create the account"));
    else goNext(next);
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="su-name">Name</Label>
        <Input id="su-name" autoComplete="name" {...form.register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" autoComplete="email" {...form.register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-password">Password</Label>
        <Input id="su-password" type="password" autoComplete="new-password" {...form.register("password")} />
        <FieldError message={errors.password?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-confirm">Confirm password</Label>
        <Input id="su-confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
        <FieldError message={errors.confirm?.message} />
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner className="border-current border-t-transparent" /> : null}
        Create account
      </Button>
    </form>
  );
}

/* ── Phone OTP (sign in or sign up — Better Auth creates the user on first verify) ── */

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((v) => normaliseNigerianPhone(v) !== null, "Enter a Nigerian mobile number, e.g. 0803 123 4567"),
});
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{4,8}$/, "Enter the code from the SMS") });

function PhoneOtp({ next, smsMock, mode }: { next: string; smsMock: boolean; mode: "sign-in" | "sign-up" }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const phoneForm = useForm<z.infer<typeof phoneSchema>>({ resolver: zodResolver(phoneSchema) });
  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema) });

  const send = async (number: string) => {
    setError(null);
    const { error: e } = await authClient.phoneNumber.sendOtp({ phoneNumber: number });
    if (e) {
      setError(errorText(e, "Could not send the code"));
      return false;
    }
    return true;
  };

  const onPhone = phoneForm.handleSubmit(async (v) => {
    const number = normaliseNigerianPhone(v.phone)!;
    if (await send(number)) setPhone(number);
  });

  const onCode = codeForm.handleSubmit(async (v) => {
    setError(null);
    const { error: e } = await authClient.phoneNumber.verify({ phoneNumber: phone!, code: v.code });
    if (e) setError(errorText(e, "That code is not valid or has expired"));
    else goNext(next);
  });

  if (!phone) {
    return (
      <form onSubmit={onPhone} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor={`${mode}-phone`}>Mobile number</Label>
          <Input
            id={`${mode}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            {...phoneForm.register("phone")}
          />
          <FieldError message={phoneForm.formState.errors.phone?.message} />
        </div>
        <p className="text-xs text-muted-foreground">
          We&apos;ll text you a one-time code.{" "}
          {mode === "sign-up" ? "Your account is created when you confirm it." : "New numbers get a new account."}
        </p>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={phoneForm.formState.isSubmitting}>
          {phoneForm.formState.isSubmitting ? <Spinner className="border-current border-t-transparent" /> : null}
          Send code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onCode} className="space-y-4" noValidate>
      <p className="text-sm">
        Enter the code sent to <span className="font-medium">{phone}</span>.{" "}
        <button type="button" className="text-xs underline" onClick={() => setPhone(null)}>
          Change number
        </button>
      </p>
      {smsMock && (
        <Alert variant="warning">
          Demo mode: no SMS is sent. The code is written to{" "}
          <code className="break-all">.storage/mock-outbox/sms-{phone.replace(/\D/g, "")}.json</code>.
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${mode}-code`}>Code</Label>
        <Input
          id={`${mode}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          {...codeForm.register("code")}
        />
        <FieldError message={codeForm.formState.errors.code?.message} />
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>
        {codeForm.formState.isSubmitting ? <Spinner className="border-current border-t-transparent" /> : null}
        Verify and continue
      </Button>
      <button
        type="button"
        className="text-xs text-muted-foreground underline"
        disabled={resent}
        onClick={async () => {
          if (await send(phone)) setResent(true);
        }}
      >
        {resent ? "Code re-sent" : "Resend code"}
      </button>
    </form>
  );
}

/* ── Public components ───────────────────────────────────────────────────── */

export function SignInPanel({ next, smsMock }: { next: string; smsMock: boolean }) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        New to PopLens?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="underline">
          Create an account
        </Link>
      </p>
      <Tabs defaultValue="email">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="email" className="flex-1">
            Email
          </TabsTrigger>
          <TabsTrigger value="phone" className="flex-1">
            Phone
          </TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <EmailSignIn next={next} />
        </TabsContent>
        <TabsContent value="phone">
          <PhoneOtp next={next} smsMock={smsMock} mode="sign-in" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function SignUpPanel({ next, smsMock }: { next: string; smsMock: boolean }) {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Already have one?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="underline">
          Sign in
        </Link>
      </p>
      <Tabs defaultValue="email">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="email" className="flex-1">
            Email
          </TabsTrigger>
          <TabsTrigger value="phone" className="flex-1">
            Phone
          </TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <EmailSignUp next={next} />
        </TabsContent>
        <TabsContent value="phone">
          <PhoneOtp next={next} smsMock={smsMock} mode="sign-up" />
        </TabsContent>
      </Tabs>
      <p className="mt-6 text-xs text-muted-foreground">
        Browsing is free. An account lets you save views and places and run limited area analysis.
      </p>
    </div>
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
