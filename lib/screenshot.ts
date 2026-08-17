import { assertPublicUrl } from "./net";
import { launchBrowser } from "./browser";

export type Shot = { dataUrl: string; note: string };

// Headless screenshot of a public URL, with SSRF guards (http(s) only; the
// hostname must resolve entirely to public addresses, re-checked after redirects).
export async function captureUrl(url: string): Promise<Shot> {
  const safeUrl = await assertPublicUrl(url);
  const target = new URL(safeUrl);

  const browser = await launchBrowser();
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
