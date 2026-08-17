// Shared headless-Chromium launcher. Serverless (Vercel/Lambda) uses
// @sparticuz/chromium; local/dev uses a system Chromium. Both the one-shot
// screenshotter and the per-persona walk session launch through here.
import type { Browser } from "puppeteer-core";

export async function launchBrowser(): Promise<Browser> {
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

  return puppeteer.launch({ executablePath, args, headless: true });
}
