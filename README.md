# Reproduction for vercel/next.js#98684

Tapping a `<Link>` while its loading-boundary prefetch is still in flight can
render the target's content slot **empty** (no `loading.tsx`, no page), and two
quick taps can leave `document.title` as `""` for good.

Pinned versions: `next@16.4.0`, `react@19.3.0`, `@playwright/test@1.63.0`.
Plain `create-next-app` output with Cache Components / Partial Prefetching
turned off (the default prefetch path).

## Routes

```
app/layout.tsx                 links to /slow and /nested/slow; <main id="slot">
app/page.tsx                   home
app/slow/loading.tsx           loading shell
app/slow/page.tsx              dynamic (connection()), 1 s
app/nested/layout.tsx          dynamic layout with its own tab links
app/nested/page.tsx            index
app/nested/slow/loading.tsx    loading shell
app/nested/slow/page.tsx       dynamic, 1 s
app/nested/slow/detail/page.tsx dynamic, 1 s, no loading.tsx of its own
```

## Run

```bash
npm install
npx playwright install chromium
npm test        # builds, starts `next start` on :3100, runs the tests
```

## What the test does

A `<Link>` to a dynamic route with a `loading.tsx` is prefetched up to the first
loading boundary: a Flight request with `Next-Router-Prefetch: 1` and
`Next-Router-State-Tree`, but no `Next-Router-Segment-Prefetch` header. The
test holds that request and the navigation request with `page.route`, taps the
link, then releases the **prefetch first** and the navigation second. It records
what the content slot shows on every animation frame.

In real use the window is the prefetch's own round trip: a link scrolls into
view or is hovered, and the tap lands before the prefetch finishes, on a page
that takes longer than the prefetch.

## Result on 16.4.0

All three tests fail (9/9 runs):

```
/slow:
  0ms previous page (title "Home")
  81ms EMPTY (title "Slow page")          <- prefetch landed, nothing rendered
two taps:
  3ms previous page (title "Nested section")
  87ms loading (title "")
  1588ms page (title "")                  <- title never comes back
```

The slot stays empty until the page's own response arrives. Expected: the
target's `loading.tsx` while the page loads, and the right title.
