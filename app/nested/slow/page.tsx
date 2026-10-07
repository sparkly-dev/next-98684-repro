import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Nested slow page",
};

export default async function NestedSlowPage() {
  await connection();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <p id="page">Nested slow page content</p>;
}
