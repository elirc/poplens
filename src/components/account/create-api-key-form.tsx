"use client";

import { useActionState, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import type { CreateKeyState } from "@/app/(account)/account/actions";

/**
 * Create-key form. The plaintext key comes back from the Server Action
 * exactly once and is shown here; it is never stored or shown again.
 */
export function CreateApiKeyForm({
  action,
  disabled,
}: {
  action: (prev: CreateKeyState, fd: FormData) => Promise<CreateKeyState>;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      {state.plaintext && (
        <Alert variant="warning">
          <p className="mb-2 font-medium">
            Copy your new key “{state.name}” now — it will not be shown again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-background px-2 py-1 font-mono text-xs" data-testid="new-api-key">
              {state.plaintext}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.plaintext!);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <Copy /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Alert>
      )}
      {state.error && <Alert variant="destructive">{state.error}</Alert>}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="key-name">Key name</Label>
          <Input id="key-name" name="name" placeholder="e.g. Dashboard server" maxLength={60} required disabled={disabled} />
        </div>
        <Button type="submit" disabled={pending || disabled}>
          <KeyRound /> {pending ? "Creating…" : "Create key"}
        </Button>
      </form>
    </div>
  );
}
