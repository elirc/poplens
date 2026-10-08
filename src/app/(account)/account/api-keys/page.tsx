import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/env";
import { getUserPlan } from "@/lib/limits";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateApiKeyForm } from "@/components/account/create-api-key-form";
import { ConfirmSubmitButton } from "@/components/account/submit-button";
import { AccountNav, Flash, flashFrom, PageTitle, When } from "@/components/account/ui";
import { API_BURST_PER_MINUTE } from "@/server/api-keys/keys";
import { listApiKeysForUser } from "@/server/api-keys/store";
import { describeLimit } from "@/server/billing/plans";
import { createApiKeyAction, revokeApiKeyAction } from "../actions";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const flash = flashFrom(await searchParams);
  const [plan, keys] = await Promise.all([getUserPlan(user.id), listApiKeysForUser(user.id)]);
  const allowed = plan.limits.apiAccess;
  const base = new URL("/api/v1", env.APP_URL).toString();

  return (
    <div>
      <AccountNav active="/account/api-keys" />
      <PageTitle title="API keys">
        <Link href="/docs/api" className="text-sm underline">
          API documentation
        </Link>
      </PageTitle>
      <Flash {...flash} />
      {!allowed && (
        <Alert variant="warning" className="mb-4">
          Your plan ({plan.planCode}) does not include API access.{" "}
          <Link href="/account/billing" className="underline">
            Upgrade to Pro
          </Link>{" "}
          to create keys. Existing keys stop working while API access is not included.
        </Alert>
      )}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Create a key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CreateApiKeyForm action={createApiKeyAction} disabled={!allowed} />
          <p className="text-xs text-muted-foreground">
            Keys are stored hashed; we cannot show a key again after creation. Limits on your plan:{" "}
            {describeLimit(plan.limits.apiRequestsPerDay, "requests")} per key (resets at midnight Africa/Lagos), and
            at most {API_BURST_PER_MINUTE} requests a minute.
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
            {`curl -H "Authorization: Bearer pl_live_…" "${base}/values?indicator=pop_total&level=state"`}
          </pre>
        </CardContent>
      </Card>

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no API keys yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Today</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <When d={k.createdAt} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <When d={k.lastUsedAt} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{k.usedToday.toLocaleString("en-NG")}</TableCell>
                <TableCell className="text-right">
                  {k.revokedAt ? (
                    <Badge variant="destructive">revoked</Badge>
                  ) : (
                    <form action={revokeApiKeyAction} className="inline">
                      <input type="hidden" name="id" value={k.id} />
                      <ConfirmSubmitButton
                        size="sm"
                        variant="outline"
                        confirmText={`Revoke “${k.name}”? Apps using it will stop working immediately.`}
                      >
                        Revoke
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
