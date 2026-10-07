import { test, expect, type Page, type Request, type Route } from "@playwright/test";

// Reproduces vercel/next.js#98684.
//
// A <Link> to a dynamic route with a `loading.tsx` is prefetched "up to the
// first loading boundary". If the link is tapped while that prefetch is still
// in flight, and the prefetch response arrives before the page's own response,
// the content slot renders empty (no loading.tsx, no page) and the document
// title can be lost.
//
// To make the race deterministic, the test holds both requests and releases
// them in that order: first the prefetch, then the navigation.

type Kind = "loading-boundary-prefetch" | "navigation";

function classify(h: Record<string, string>): Kind | null {
  if (h["rsc"] !== "1") return null;
  if (h["next-router-prefetch"] === undefined) return "navigation";
  // The second-stage prefetch: `Next-Router-Prefetch: 1` plus the router
  // state tree, and no per-segment header.
  if (
    h["next-router-prefetch"] === "1" &&
    h["next-router-state-tree"] !== undefined &&
    h["next-router-segment-prefetch"] === undefined
  ) {
    return "loading-boundary-prefetch";
  }
  return null;
}

// Holds the listed requests until the test releases them.
async function holdRequests(page: Page, toHold: string[]) {
  const held = new Map<
    string,
    { promise: Promise<[Route, Request]>; resolve: (v: [Route, Request]) => void }
  >();
  const slot = (key: string) => {
    let entry = held.get(key);
    if (!entry) {
      let resolve!: (v: [Route, Request]) => void;
      const promise = new Promise<[Route, Request]>((r) => (resolve = r));
      entry = { promise, resolve };
      held.set(key, entry);
    }
    return entry;
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const kind = classify(await request.allHeaders());
    const key = kind && `${kind} ${new URL(request.url()).pathname}`;
    if (!key || !toHold.includes(key)) return route.continue();
    slot(key).resolve([route, request]);
  });
  return {
    // Resolves when the request has been made; returns a function that lets
    // it through and waits until the browser has the response.
    async waitFor(key: string) {
      const [route, request] = await slot(key).promise;
      return async () => {
        const settled = new Promise<void>((resolve) => {
          const done = (r: Request) => r === request && resolve();
          page.on("requestfinished", done);
          page.on("requestfailed", done);
        });
        await route.continue();
        await settled;
      };
    },
  };
}

// Records, on every animation frame, what the content slot shows.
async function startRecording(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: { t: number; state: string; title: string }[] };
    w.__frames = [];
    const t0 = performance.now();
    const tick = () => {
      const state = document.querySelector("#page")
        ? "page"
        : document.querySelector("#loading")
          ? "loading"
          : document.querySelector("#home")
            ? "previous page"
            : "EMPTY";
      w.__frames.push({ t: Math.round(performance.now() - t0), state, title: document.title });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopRecording(page: Page) {
  const frames = await page.evaluate(
    () => (window as unknown as { __frames: { t: number; state: string; title: string }[] }).__frames,
  );
  const timeline = frames
    .filter((f, i) => i === 0 || f.state !== frames[i - 1].state || f.title !== frames[i - 1].title)
    .map((f) => `${f.t}ms ${f.state} (title "${f.title}")`);
  return { emptyFrames: frames.filter((f) => f.state === "EMPTY").length, timeline };
}

async function nextFrames(page: Page, n: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const tick = () => (--n <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}

const cases = [
  { from: "/", path: "/slow", title: "Slow page" },
  { from: "/nested", path: "/nested/slow", title: "Nested slow page" },
];

for (const { from, path, title } of cases) {
  test(`tap ${path} (from ${from}) while its loading-boundary prefetch is in flight`, async ({ page }) => {
    const requests = await holdRequests(page, [
      `loading-boundary-prefetch ${path}`,
      `navigation ${path}`,
    ]);
    await page.goto(from);
    await expect(page.locator("#home")).toBeVisible();
    const releasePrefetch = await requests.waitFor(`loading-boundary-prefetch ${path}`);
    await startRecording(page);

    await page.click(`a[href="${path}"] >> nth=-1`);
    const releaseNavigation = await requests.waitFor(`navigation ${path}`);

    // The prefetch lands first, the page after it. The prefetch carries the
    // route's loading.tsx, so the shell should paint now, without waiting for
    // the navigation's own response.
    await releasePrefetch();
    await nextFrames(page, 30);
    await expect(page.locator("#loading"), "loading shell from the prefetch").toBeVisible({
      timeout: 2_000,
    });
    await releaseNavigation();
    await expect(page.locator("#page")).toBeVisible({ timeout: 10_000 });
    await nextFrames(page, 5);

    const { emptyFrames, timeline } = await stopRecording(page);
    console.log(`${path}:\n  ${timeline.join("\n  ")}`);
    expect(emptyFrames, "frames where the content slot was empty").toBe(0);
    await expect(page).toHaveTitle(title);
  });
}

test("two quick taps while the prefetches are in flight keep the document title", async ({ page }) => {
  const requests = await holdRequests(page, [
    "loading-boundary-prefetch /nested/slow",
    "loading-boundary-prefetch /nested/slow/detail",
    "navigation /nested/slow/detail",
  ]);
  await page.goto("/nested");
  await expect(page.locator("#home")).toBeVisible();
  const releaseSlowPrefetch = await requests.waitFor("loading-boundary-prefetch /nested/slow");
  const releaseDetailPrefetch = await requests.waitFor("loading-boundary-prefetch /nested/slow/detail");
  await startRecording(page);

  await page.click('#tabs a[href="/nested/slow"]');
  await page.click('#tabs a[href="/nested/slow/detail"]');
  const releaseNavigation = await requests.waitFor("navigation /nested/slow/detail");

  await releaseSlowPrefetch();
  await releaseDetailPrefetch();
  await nextFrames(page, 30);
  await releaseNavigation();
  await expect(page.locator("#page")).toHaveText("Detail page content", { timeout: 10_000 });
  await nextFrames(page, 30);

  const { emptyFrames, timeline } = await stopRecording(page);
  console.log(`two taps:\n  ${timeline.join("\n  ")}`);
  await expect(page).toHaveTitle("Detail page");
  expect(emptyFrames, "frames where the content slot was empty").toBe(0);
});
