import { assertPublicUrl } from "./net";

export type Shot = { dataUrl: string; note: string };

// Headless screenshot of a public URL, with SSRF guards (http(s) only; the
// hostname must resolve entirely to public addresses, re-checked after redirects).
// Serverless uses @sparticuz/chromium; local/dev uses a system Chromium.
export async function captureUrl(url: string): Promise<Shot> {
  const safeUrl = await assertPublicUrl(url);
  const target = new URL(safeUrl);

  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_VERSION || process.env.VERCEL === "1";
  const puppeteer = (await import("puppeteer-core")).default;

  let executablePath: string;
  let args: string[];
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    executablePath =
      process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/opt/pw-browsers/chromium";
    args = ["--no-sandbox", "--disable-setuid-sandbox"];
  }

  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(target.toString(), { waitUntil: "networkidle2", timeout: 30000 });
    await assertPublicUrl(page.url()); // redirect-escape guard
    const buf = (await page.screenshot({
      type: "jpeg",
      quality: 80,
      clip: { x: 0, y: 0, width: 1280, height: 2200 },
    })) as Buffer;
    return {
      dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`,
      note: `Captured ${target.toString()} at 1280px wide.`,
    };
  } finally {
    await browser.close();
  }
}
