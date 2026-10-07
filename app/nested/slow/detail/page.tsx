import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Detail page",
};

// No loading.tsx of its own: /nested/slow/loading.tsx is its loading boundary.
export default async function DetailPage() {
  await connection();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <p id="page">Detail page content</p>;
}
