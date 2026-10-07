import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link> · <Link href="/slow">Slow page</Link> ·{" "}
          <Link href="/nested/slow">Nested slow page</Link>
        </nav>
        <main id="slot">{children}</main>
      </body>
    </html>
  );
}
