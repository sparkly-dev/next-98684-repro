import type { NextConfig } from "next";

// Cache Components / Partial Prefetching are left off on purpose: the bug is in
// the default prefetch path, where a dynamic route with a `loading.tsx` is
// prefetched "up to the first loading boundary".
const nextConfig: NextConfig = {};

export default nextConfig;
