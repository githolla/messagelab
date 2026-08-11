/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the headless-chromium packages out of the webpack bundle so the
  // serverless function resolves the binary at runtime instead of tree-shaking it.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};
export default nextConfig;
