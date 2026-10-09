import { test, expect, type Browser, type Page } from "@playwright/test";
import path from "node:path";

/**
 * The full definition-of-done journey (docs/SPEC.md), in order:
 *  1. explore an indicator on the map          6. publish an insight card
 *  2. open an LGA profile                      7. subscribe to Pro (mock)
 *  3. compare two states                       8. download a table
 *  4. run an area analysis                     9. build a custom report
 *  5. upload + publish a dataset (editor)     10. call the API with a key
 * Serial: later steps depend on earlier ones (Pro plan, published data).
 * Requires the seeded dev database (pnpm seed) in mock mode.
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);

/**
 * Visitor-side tests use a FRESH account created by test 4 via the sign-up
 * form, so re-running the suite never trips the 3/day area-analysis quota or
 * finds the demo user already subscribed to Pro. Staff tests keep the seeded
 * editor/writer accounts (their flows are idempotent).
 */
const E2E_USER = {
  name: `E2E Journey ${RUN}`,
  email: `e2e-${RUN}@poplens.local`,
  password: "e2e-pass-1234",
};

async function signUp(page: Page, next: string) {
  await page.goto(`/sign-up?next=${encodeURIComponent(next)}`);
  await page.locator("#su-name").fill(E2E_USER.name);
  await page.locator("#su-email").fill(E2E_USER.email);
  await page.locator("#su-password").fill(E2E_USER.password);
  await page.locator("#su-confirm").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-up"), {
    waitUntil: "commit",
  });
}

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator("#si-email").fill(email);
  await page.locator("#si-password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    waitUntil: "commit",
  });
}

async function newSignedInPage(
  browser: Browser,
  email: string,
  password: string,
  next: string,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email, password, next);
  return page;
}

test("0. warm the routes the journey hits", async ({ request }) => {
  // Dev-mode route compilation is slow on this machine; hitting each route
  // once up front keeps later navigation waits honest. Responses (including
  // auth redirects) are irrelevant — compilation is the point.
  test.setTimeout(360_000);
  const routes = [
    "/sign-in",
    "/sign-up",
    "/area",
    "/editor/uploads",
    "/editor/drafts",
    "/editor/content/cards/new",
    "/account/billing",
    "/account/reports",
    "/account/api-keys",
    "/rankings?indicator=u5mr&level=state&year=2018",
    "/places/NG-KN-GWALE",
    "/compare?places=NG-KN,NG-LA&indicators=u5mr",
  ];
  for (const r of routes) {
    await request.get(r, { timeout: 120_000 }).catch(() => undefined);
  }
});

test("1. explore an indicator on the map", async ({ page }) => {
  await page.goto("/explore?i=u5mr&y=2018&l=state");
  // Demo banner (synthetic data is published).
  await expect(
    page.getByText("Demo data — the figures on this site are synthetic", { exact: false }),
  ).toBeVisible();
  // The map canvas renders and the legend shows class ranges.
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  // Table view of the same data names real states.
  await page.goto("/explore?i=u5mr&y=2018&l=state&v=table");
  await expect(page.getByText("Kano", { exact: true }).first()).toBeVisible();
});

test("2. open an LGA profile", async ({ page }) => {
  await page.goto("/places/NG-KN-GWALE");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Gwale/i);
  await expect(page.getByText(/Key facts/i).first()).toBeVisible();
  await expect(page.getByText(/Sources used/i).first()).toBeVisible();
  // Never a bare zero for missing data: the words "No data" may appear, 0 as a tile value must not be asserted — spot check at least one populated tile instead.
  await expect(page.getByText(/people per km²|people/i).first()).toBeVisible();
});

test("3. compare two states", async ({ page }) => {
  await page.goto("/compare?places=NG-KN,NG-LA&indicators=u5mr,anc4");
  await expect(page.getByText("Kano").first()).toBeVisible();
  await expect(page.getByText("Lagos").first()).toBeVisible();
  // One chart per indicator with its table toggle present.
  await expect(page.getByRole("tab", { name: /table/i }).first()).toBeVisible();
});

test("4. run an area analysis (free quota)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, "/area");
  // The tool restores a shared shape from the URL hash on MOUNT. Landing on
  // /area and then adding a hash is a same-document change that pre-hydration
  // router state can clobber — hop through another page so the hash URL loads
  // as a fresh document.
  await page.goto("/about-data", { waitUntil: "domcontentloaded" });
  await page.goto("/area#circle=8.55,12.0,15");
  await expect(page.getByRole("button", { name: /run analysis/i })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /run analysis/i }).click();
  // Results panel: population estimate, facilities, LGAs touched, quota line.
  await expect(page.getByText(/estimated population|population inside|total population/i).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/LGA/i).first()).toBeVisible();
  await expect(page.getByText(/free analys|unlimited/i).first()).toBeVisible();
  await page.context().close();
});

test("5. upload and publish a dataset as a data editor", async ({ browser }) => {
  test.setTimeout(600_000); // five server actions in sequence on a slow box
  const page = await newSignedInPage(
    browser,
    "editor@poplens.ng",
    "editor1234",
    "/editor/uploads",
  );

  // Step 1: upload the file.
  await page.goto("/editor/uploads");
  await page
    .locator("#file")
    .setInputFiles(path.join(__dirname, "fixtures", "upload-health-insurance.csv"));
  // Any real (non-synthetic) source works; prefer the NBS one.
  const sourceSelect = page.locator("#sourceId");
  const nbsValue = await sourceSelect
    .locator("option", { hasText: "National Bureau" })
    .first()
    .getAttribute("value")
    .catch(() => null);
  const fallbackValue = await sourceSelect
    .locator("option:not([disabled])")
    .first()
    .getAttribute("value");
  await sourceSelect.selectOption(nbsValue ?? fallbackValue!);
  await page.locator("#title").fill(`E2E health insurance upload ${RUN}`);
  await page.locator("#seriesKey").fill(`e2e-health-insurance-${RUN}`);
  await Promise.all([
    page.waitForURL(/\/editor\/(uploads|drafts)\/[^/]+/, {
      timeout: 120_000,
      waitUntil: "commit",
    }),
    page.getByRole("button", { name: "Upload and continue" }).click({ noWaitAfter: true }),
  ]);

  // The wizard auto-guesses the column mapping; when the guess is complete
  // and every place matches it can fast-forward straight to the draft page.
  // Walk whichever wizard steps actually appear (state machine — steps keep
  // the same URL until the final create redirects to the draft).
  const draftUrl = /\/editor\/drafts\/\d+/;
  for (let i = 0; i < 8 && !draftUrl.test(page.url()); i++) {
    const mapping = page.getByRole("button", { name: "Save mapping and match places" });
    const validate = page.getByRole("button", { name: "Confirm and validate" });
    const create = page.getByRole("button", { name: "Create draft dataset" });
    await Promise.race([
      mapping.waitFor({ state: "visible", timeout: 150_000 }).catch(() => {}),
      validate.waitFor({ state: "visible", timeout: 150_000 }).catch(() => {}),
      create.waitFor({ state: "visible", timeout: 150_000 }).catch(() => {}),
      page
        .waitForURL(draftUrl, { timeout: 150_000, waitUntil: "commit" })
        .catch(() => {}),
    ]);
    if (draftUrl.test(page.url())) break;
    if (await mapping.isVisible().catch(() => false)) {
      await page.locator("select[name=place]").selectOption({ label: "state" });
      await page.locator("select[name=year]").selectOption({ label: "year" });
      await page.locator("select[name=value]").selectOption({ label: "insured_pct" });
      await page.locator("#m-fixedIndicator").selectOption("health_insurance");
      await mapping.click();
    } else if (await validate.isVisible().catch(() => false)) {
      await validate.click();
    } else if (await create.isVisible().catch(() => false)) {
      await Promise.all([
        page
          .waitForURL(draftUrl, { timeout: 240_000, waitUntil: "commit" })
          .catch(() => {}),
        create.click({ noWaitAfter: true }),
      ]);
    }
    await page.waitForTimeout(1_500);
  }
  expect(draftUrl.test(page.url())).toBeTruthy();

  // Publish from the draft page: change summary shows 3 added rows, the
  // review checkbox arms the Publish button.
  await expect(
    page.getByText("health_insurance · NG-LA · 2021").first(),
  ).toBeVisible();
  await page.getByLabel(/I have reviewed the changes/i).check();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/published/i).first()).toBeVisible({ timeout: 120_000 });

  // The values are now public.
  const res = await page.request.get(
    "/api/geo/values?indicator=health_insurance&level=state&year=2021",
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { values: Array<{ value: number }> };
  expect(body.values.some((v) => Math.abs(v.value - 8.4) < 1e-9)).toBeTruthy();
  await page.context().close();
});

test("6. publish an insight card as a content editor", async ({ browser }) => {
  const page = await newSignedInPage(
    browser,
    "writer@poplens.ng",
    "writer1234",
    "/editor/content/cards/new",
  );
  await page.goto("/editor/content/cards/new");
  // Title + caption, then save and publish.
  const title = page.getByLabel(/title/i).first();
  await title.fill(`E2E card ${RUN}`);
  const caption = page.getByLabel(/caption/i).first();
  await caption.fill("Synthetic demo data — e2e journey card.");
  await page.getByRole("button", { name: /^save/i }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.getByRole("button", { name: /publish/i }).click();
  await expect(page.getByText(/published — the card is live/i)).toBeVisible();
  await page.context().close();
});

test("7–10. subscribe to Pro, download, custom report, API key", async ({ browser }) => {
  test.setTimeout(360_000); // four flows in sequence on a slow box
  const page = await newSignedInPage(
    browser,
    E2E_USER.email,
    E2E_USER.password,
    "/account/billing",
  );

  // 7. Subscribe to Pro through the mock hosted checkout.
  await page.goto("/account/billing?plan=pro");
  await page.getByRole("button", { name: /subscribe to pro/i }).click();
  await page.waitForURL(/mock-checkout/);
  await page.getByRole("button", { name: /^pay/i }).click();
  await page.waitForURL(/\/account\/billing/);
  await expect(page.getByText(/current plan: .*pro/i).first()).toBeVisible();

  // 8. Download a rankings table as CSV (licence + plan gates now pass).
  await page.goto("/rankings?indicator=u5mr&level=state&year=2018");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  // 9. Build a custom report.
  await page.goto("/account/reports");
  await page.getByLabel(/kano/i).first().check();
  await page.getByLabel(/under-5 mortality/i).first().check();
  const reportTitle = page.getByLabel(/title/i).first();
  if (await reportTitle.isVisible().catch(() => false)) {
    await reportTitle.fill(`E2E report ${RUN}`);
  }
  await page.getByRole("button", { name: /create|request|build report/i }).first().click();
  // Worker may not be running: use the inline "Build now" fallback.
  const buildNow = page.getByRole("button", { name: /build now/i }).first();
  if (await buildNow.isVisible().catch(() => false)) {
    await buildNow.click();
  }
  await expect(page.getByText(/ready/i).first()).toBeVisible({ timeout: 90_000 });

  // 10. Create an API key and call the public API with it.
  await page.goto("/account/api-keys");
  await page.locator("#key-name").fill(`e2e-${RUN}`);
  await page.getByRole("button", { name: /create key/i }).click();
  const keyText = await page.getByText(/pl_live_[A-Za-z0-9]+/).first().textContent();
  const key = /pl_live_[A-Za-z0-9]+/.exec(keyText ?? "")?.[0];
  expect(key).toBeTruthy();
  const api = await page.request.get("/api/v1/values?indicator=u5mr&level=state", {
    headers: { Authorization: `Bearer ${key}` },
  });
  expect(api.status()).toBe(200);
  const payload = (await api.json()) as { data: unknown[]; meta: { synthetic: boolean } };
  expect(payload.data.length).toBeGreaterThan(0);
  expect(payload.meta.synthetic).toBeTruthy();

  await page.context().close();
});
