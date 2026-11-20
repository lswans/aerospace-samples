import { expect, test } from "@playwright/test";

const LIVE_API = "https://jmfy3h30b9.execute-api.us-east-1.amazonaws.com";
const LIVE_SITE = "https://main.d1q58sgi4m7r41.amplifyapp.com";

test("loads every asset and exposes working AWS Console links", async ({ page, request }) => {
  const failed = [];
  page.on("requestfailed", (entry) => failed.push(`${entry.url()}: ${entry.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.url().startsWith("http://127.0.0.1") && response.status() >= 400) {
      failed.push(`${response.url()}: ${response.status()}`);
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GSU-RX-1 static fire" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Initiate Burn" })).toBeEnabled();
  await expect(page.locator("details.stream-panel")).not.toHaveAttribute("open", "");
  await expect(page.locator("canvas")).toHaveCount(4);
  expect(failed).toEqual([]);

  const links = await page.locator("a[href]").evaluateAll((items) => items.map((item) => item.href));
  expect(links).toHaveLength(6);
  const uniqueLinks = [...new Set(links)];
  expect(uniqueLinks).toHaveLength(4);
  for (const url of uniqueLinks) {
    expect(url).toMatch(/^https:\/\/us-east-1\.console\.aws\.amazon\.com\//);
    const response = await request.get(url, { failOnStatusCode: false, maxRedirects: 0 });
    expect(response.status(), `${url} returned ${response.status()}`).toBeLessThan(400);
  }
});

test("runs a simulated burn and fills the collapsed record panel", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Initiate Burn" }).click();
  await expect(page.getByText("Burning (simulated)")).toBeVisible();
  await expect.poll(async () => page.locator("tbody tr").count()).toBeGreaterThan(0);
  await page.locator("details.stream-panel").evaluate((panel) => { panel.open = true; });
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByText(/received/)).not.toHaveText("0 received ▾");
  expect(errors).toEqual([]);
});

test("serves a small static burst without errors", async ({ request }) => {
  const started = performance.now();
  const responses = await Promise.all(Array.from({ length: 40 }, () => request.get("/")));
  const elapsed = performance.now() - started;
  expect(responses.every((response) => response.status() === 200)).toBe(true);
  expect(elapsed).toBeLessThan(2_000);
  console.log(`Local static burst: 40/40 succeeded in ${Math.round(elapsed)} ms`);
});

test("serves a small live Amplify burst without errors", async ({ request }) => {
  const started = performance.now();
  const responses = await Promise.all(Array.from({ length: 20 }, () => request.get(LIVE_SITE)));
  const elapsed = performance.now() - started;
  expect(responses.every((response) => response.status() === 200)).toBe(true);
  expect(elapsed).toBeLessThan(5_000);
  console.log(`Amplify burst: 20/20 succeeded in ${Math.round(elapsed)} ms`);
});

test("handles normal live poll traffic without errors", async ({ request }) => {
  const times = [];
  for (let index = 0; index < 6; index += 1) {
    const started = performance.now();
    const response = await request.post(`${LIVE_API}/poll`, { data: {} });
    times.push(performance.now() - started);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.iterators).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  times.sort((a, b) => a - b);
  expect(times[times.length - 1]).toBeLessThan(2_500);
  console.log(`Live poll traffic: 6/6 succeeded; slowest ${Math.round(times[times.length - 1])} ms`);
});
