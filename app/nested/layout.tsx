import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Nested section",
};

// A dynamic layout that stays mounted while navigating between its children,
// with its own links (like a tab strip).
export default async function NestedLayout({ children }: LayoutProps<"/nested">) {
  await headers();
  return (
    <section>
      <h2>Nested section</h2>
      <nav id="tabs">
        <Link href="/nested">Index</Link> · <Link href="/nested/slow">Slow tab</Link> ·{" "}
        <Link href="/nested/slow/detail">Detail tab</Link>
      </nav>
      <div id="nested-slot">{children}</div>
    </section>
  );
}
