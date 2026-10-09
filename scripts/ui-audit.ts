import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * UI audit crawl: renders every page in three auth contexts, captures
 * screenshots plus console errors, page exceptions, failed requests,
 * missing h1s and phone-width horizontal overflow. Output: a JSON issue
 * report + PNGs under the --out directory.
 *
 *   pnpm tsx scripts/ui-audit.ts --out C:/path/to/dir
 *
 * Run against the production server on :3000 with the seeded dev DB.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "ui-audit-out";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

interface RouteDef {
  name: string;
  url: string;
  ctx: "anon" | "user" | "admin";
  desktopToo?: boolean;
  settleMs?: number;
  noH1?: boolean;
}

const ROUTES: RouteDef[] = [
  // ── public, anonymous ──
  { name: "home", url: "/", ctx: "anon", desktopToo: true },
  { name: "explore-map", url: "/explore?i=u5mr&y=2018&l=state", ctx: "anon", desktopToo: true, settleMs: 9000 },
  { name: "explore-table", url: "/explore?i=u5mr&y=2018&l=state&v=table", ctx: "anon" },
  { name: "explore-wards", url: "/explore?i=pop_total&l=ward&c=8.5,11.9,8", ctx: "anon", settleMs: 7000 },
  { name: "profile-nation", url: "/places/NG", ctx: "anon" },
  { name: "profile-state", url: "/places/NG-KN", ctx: "anon", desktopToo: true },
  { name: "profile-lga", url: "/places/NG-KN-GWALE", ctx: "anon" },
  { name: "profile-ward", url: "/places/NG-KN-KABO-W02", ctx: "anon" },
  { name: "indicators", url: "/indicators", ctx: "anon" },
  { name: "indicator-detail", url: "/indicators/u5mr", ctx: "anon", desktopToo: true },
  { name: "about-data", url: "/about-data", ctx: "anon" },
  { name: "compare", url: "/compare?places=NG-KN,NG-LA,NG-RI&indicators=u5mr,anc4,stunting", ctx: "anon", desktopToo: true },
  { name: "rankings", url: "/rankings?indicator=u5mr&level=state&year=2018", ctx: "anon", desktopToo: true },
  { name: "trends", url: "/trends?indicator=u5mr&places=NG,NG-KN,NG-LA", ctx: "anon", desktopToo: true },
  { name: "relationships", url: "/relationships?x=female_literacy&y=u5mr", ctx: "anon", desktopToo: true },
  { name: "outbreaks", url: "/outbreaks?disease=cholera", ctx: "anon", desktopToo: true, settleMs: 6000 },
  { name: "facilities", url: "/facilities", ctx: "anon", desktopToo: true, settleMs: 6000 },
  { name: "facilities-ppf", url: "/facilities?view=ppf", ctx: "anon", settleMs: 6000 },
  { name: "area-anon", url: "/area#circle=8.55,12.0,15", ctx: "anon", settleMs: 5000 },
  { name: "stories", url: "/stories", ctx: "anon" },
  { name: "story-detail", url: "/stories/immunisation-gap-demo", ctx: "anon", desktopToo: true },
  { name: "cards", url: "/cards", ctx: "anon", settleMs: 9000 },
  { name: "card-detail", url: "/cards/top5-u5mr-2018", ctx: "anon" },
  { name: "updates", url: "/updates", ctx: "anon" },
  { name: "pricing", url: "/pricing", ctx: "anon" },
  { name: "api-docs", url: "/docs/api", ctx: "anon", desktopToo: true },
  { name: "sign-in", url: "/sign-in", ctx: "anon" },
  { name: "sign-up", url: "/sign-up", ctx: "anon" },
  { name: "embed-chart", url: "/embed/chart?type=trend&indicator=u5mr&places=NG,NG-KN", ctx: "anon", noH1: true },
  { name: "embed-map", url: "/embed/map?i=u5mr&l=state", ctx: "anon", noH1: true, settleMs: 6000 },
  { name: "not-found", url: "/places/NG-XX-DOESNOTEXIST", ctx: "anon", noH1: true },
  // ── signed-in user ──
  { name: "area-user", url: "/area#circle=8.55,12.0,15", ctx: "user", settleMs: 5000 },
  { name: "account", url: "/account", ctx: "user" },
  { name: "account-views", url: "/account/views", ctx: "user" },
  { name: "account-keys", url: "/account/api-keys", ctx: "user" },
  { name: "account-billing", url: "/account/billing", ctx: "user" },
  { name: "account-reports", url: "/account/reports", ctx: "user", desktopToo: true },
  // ── staff (admin passes every gate) ──
  { name: "editor-home", url: "/editor", ctx: "admin", desktopToo: true },
  { name: "editor-uploads", url: "/editor/uploads", ctx: "admin", desktopToo: true },
  { name: "editor-drafts", url: "/editor/drafts", ctx: "admin" },
  { name: "editor-draft-detail", url: "/editor/drafts/10", ctx: "admin", desktopToo: true },
  { name: "editor-sources", url: "/editor/sources", ctx: "admin" },
  { name: "editor-aliases", url: "/editor/aliases", ctx: "admin" },
  { name: "editor-quality", url: "/editor/quality", ctx: "admin" },
  { name: "editor-connectors", url: "/editor/connectors", ctx: "admin" },
  { name: "editor-run-detail", url: "/editor/runs/8", ctx: "admin" },
  { name: "content-home", url: "/editor/content", ctx: "admin" },
  { name: "content-story-new", url: "/editor/content/stories/new", ctx: "admin", desktopToo: true },
  { name: "content-card-new", url: "/editor/content/cards/new", ctx: "admin", desktopToo: true },
  { name: "admin-home", url: "/admin", ctx: "admin" },
  { name: "admin-users", url: "/admin/users", ctx: "admin", desktopToo: true },
  { name: "admin-orgs", url: "/admin/orgs", ctx: "admin" },
  { name: "admin-plans", url: "/admin/plans", ctx: "admin" },
  { name: "admin-usage", url: "/admin/usage", ctx: "admin" },
  { name: "admin-downloads", url: "/admin/downloads", ctx: "admin" },
  { name: "admin-audit", url: "/admin/audit", ctx: "admin" },
];

interface Issue {
  route: string;
  viewport: string;
  kind: string;
  detail: string;
}

const issues: Issue[] = [];
const IGNORE_CONSOLE = [
  /Download the React DevTools/i,
  /favicon/i,
  /AbortError/i,
  /net::ERR_ABORTED/i,
  /was preloaded using link preload/i,
];

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/sign-in`);
  await page.locator("#si-email").fill(email);
  await page.locator("#si-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { waitUntil: "commit" });
  await page.waitForTimeout(1500);
}

async function auditPage(
  context: BrowserContext,
  route: RouteDef,
  viewport: { width: number; height: number },
  label: string,
) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORE_CONSOLE.some((r) => r.test(m.text()))) {
      consoleErrors.push(m.text().slice(0, 300));
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("response", (res) => {
    const u = res.url();
    if (res.status() >= 400 && u.startsWith(BASE) && !/favicon|_next\/static/.test(u)) {
      failedRequests.push(`${res.status()} ${u.replace(BASE, "")}`.slice(0, 200));
    }
  });

  let status = 0;
  try {
    const res = await page.goto(`${BASE}${route.url}`, { waitUntil: "load", timeout: 120_000 });
    status = res?.status() ?? 0;
  } catch (e) {
    issues.push({ route: route.name, viewport: label, kind: "nav-timeout", detail: String(e).slice(0, 200) });
  }
  await page.waitForTimeout(route.settleMs ?? 2000);

  const expected = route.name === "not-found" ? 404 : 200;
  if (status !== expected) {
    issues.push({ route: route.name, viewport: label, kind: "http-status", detail: `got ${status}, expected ${expected}` });
  }
  for (const c of consoleErrors) issues.push({ route: route.name, viewport: label, kind: "console-error", detail: c });
  for (const f of [...new Set(failedRequests)])
    issues.push({ route: route.name, viewport: label, kind: "failed-request", detail: f });

  const checks = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const overflowX = doc.scrollWidth - document.documentElement.clientWidth;
    const h1 = document.querySelectorAll("h1").length;
    const brokenImgs = [...document.querySelectorAll("img")]
      .filter((i) => i.complete && i.naturalWidth === 0 && i.src)
      .map((i) => i.src.slice(0, 150));
    return { overflowX, h1, brokenImgs };
  });
  if (label === "phone" && checks.overflowX > 4) {
    issues.push({ route: route.name, viewport: label, kind: "h-overflow", detail: `${checks.overflowX}px wider than viewport` });
  }
  if (!route.noH1 && checks.h1 === 0) {
    issues.push({ route: route.name, viewport: label, kind: "no-h1", detail: "page has no <h1>" });
  }
  if (checks.h1 > 1) {
    issues.push({ route: route.name, viewport: label, kind: "multi-h1", detail: `${checks.h1} h1 elements` });
  }
  for (const b of checks.brokenImgs)
    issues.push({ route: route.name, viewport: label, kind: "broken-img", detail: b });

  await page.screenshot({ path: path.join(OUT, `${route.name}--${label}.png`) });
  await page.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  const contexts: Record<string, BrowserContext> = {
    anon: await browser.newContext(),
    user: await browser.newContext(),
    admin: await browser.newContext(),
  };
  {
    const p = await contexts.user.newPage();
    await signIn(p, "user@poplens.ng", "user1234");
    await p.close();
    const a = await contexts.admin.newPage();
    await signIn(a, "admin@poplens.ng", "admin1234");
    await a.close();
  }

  for (const route of ROUTES) {
    const ctx = contexts[route.ctx];
    await auditPage(ctx, route, PHONE, "phone");
    if (route.desktopToo) await auditPage(ctx, route, DESKTOP, "desktop");
    console.log(`done ${route.name}`);
  }

  writeFileSync(path.join(OUT, "issues.json"), JSON.stringify(issues, null, 2));
  console.log(`\n${issues.length} issues recorded → ${path.join(OUT, "issues.json")}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
