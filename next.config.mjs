/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the headless-chromium packages out of the webpack bundle so the
  // serverless function resolves the binary at runtime instead of tree-shaking it.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // serverExternalPackages alone traces the package's JS, but @sparticuz/chromium
  // ships the browser as compressed *data* under bin/ (chromium.br, fonts, …) which
  // the tracer can't see because nothing `require`s it. Without this, the deployed
  // function is missing /var/task/node_modules/@sparticuz/chromium/bin and every
  // launch fails. Force those files into each route that launches a browser.
  outputFileTracingIncludes: {
    "/api/focus-walk": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/screenshot": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/review": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};
export default nextConfig;
