import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Slow page",
};

export default async function SlowPage() {
  await connection();
  // A little slow, like a real data-fetching page.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <p id="page">Slow page content</p>;
}
