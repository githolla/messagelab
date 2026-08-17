// A live browse session a persona-agent drives one step at a time: it sees the
// current viewport (with numbered "set-of-marks" badges on clickable elements)
// plus a text list of those elements, then picks the next action. Every
// navigation is re-checked against the SSRF guard so a click can't walk the
// headless browser into a private address.
import type { Browser, Page } from "puppeteer-core";
import { assertPublicUrl } from "./net";
import { launchBrowser } from "./browser";

export type Clickable = { i: number; tag: string; text: string; href: string };

const VIEW_W = 1280;
const VIEW_H = 860;
const MAX_ELEMENTS = 36;

export class BrowseSession {
  private constructor(
    private browser: Browser,
    private page: Page,
  ) {}

  static async open(): Promise<BrowseSession> {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1 });
    await page.setDefaultNavigationTimeout(25000);
    return new BrowseSession(browser, page);
  }

  url(): string {
    return this.page.url();
  }

  async pageTitle(): Promise<string> {
    try {
      return (await this.page.title()).slice(0, 120);
    } catch {
      return "";
    }
  }

  /** Navigate to a URL after asserting it resolves to a public address. */
  async goto(url: string): Promise<void> {
    const safe = await assertPublicUrl(url);
    await this.page.goto(safe, { waitUntil: "domcontentloaded", timeout: 25000 });
    await this.settle();
    await assertPublicUrl(this.page.url());
  }

  /** Collect visible, in-viewport interactive elements and tag them for clicking. */
  async clickables(): Promise<Clickable[]> {
    return this.page.evaluate((max: number) => {
      const vh = window.innerHeight;
      const sel = "a[href], button, [role='button'], input[type='submit'], input[type='button'], [onclick]";
      const out: { i: number; tag: string; text: string; href: string }[] = [];
      let i = 0;
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.bottom < 0 || r.top > vh) continue; // only what's on screen right now
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none" || st.opacity === "0") continue;
        const raw =
          (el as HTMLElement).innerText ||
          (el as HTMLInputElement).value ||
          el.getAttribute("aria-label") ||
          (el as HTMLElement).title ||
          "";
        const text = raw.trim().replace(/\s+/g, " ").slice(0, 70);
        const href = el.getAttribute("href") || "";
        if (!text && el.tagName !== "A") continue;
        el.setAttribute("data-fgw", String(i));
        out.push({ i, tag: el.tagName.toLowerCase(), text, href });
        i++;
        if (i >= max) break;
      }
      return out;
    }, MAX_ELEMENTS);
  }

  /** Screenshot the current viewport, optionally overlaying index badges. */
  async shot(badges = true): Promise<string> {
    if (badges) await this.drawBadges();
    const buf = (await this.page.screenshot({ type: "jpeg", quality: 68 })) as Buffer;
    if (badges) await this.clearBadges();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  }

  /** Click the element with the given index; settle and re-guard the URL. */
  async click(i: number): Promise<void> {
    await this.clearBadges();
    const sel = `[data-fgw="${i}"]`;
    const handle = await this.page.$(sel);
    if (!handle) throw new Error(`Element ${i} is gone.`);
    const before = this.page.url();
    try {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {}),
        handle.click({ delay: 20 }),
      ]);
    } catch {
      /* click may not navigate (in-page control) — fine */
    }
    await this.settle();
    if (this.page.url() !== before) await assertPublicUrl(this.page.url());
  }

  async scroll(): Promise<void> {
    await this.clearBadges();
    await this.page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.85)));
    await sleep(500);
  }

  async back(): Promise<void> {
    await this.clearBadges();
    await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await this.settle();
    await assertPublicUrl(this.page.url());
  }

  async close(): Promise<void> {
    await this.browser.close().catch(() => {});
  }

  private async settle(): Promise<void> {
    await this.page
      .waitForNetworkIdle({ idleTime: 500, timeout: 6000 })
      .catch(() => {});
    await sleep(300);
  }

  private async drawBadges(): Promise<void> {
    await this.page.evaluate(() => {
      document.getElementById("fgw-badges")?.remove();
      const box = document.createElement("div");
      box.id = "fgw-badges";
      for (const el of Array.from(document.querySelectorAll("[data-fgw]"))) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        const b = document.createElement("div");
        b.textContent = el.getAttribute("data-fgw") || "";
        Object.assign(b.style, {
          position: "fixed",
          left: Math.max(0, r.left) + "px",
          top: Math.max(0, r.top) + "px",
          zIndex: "2147483647",
          background: "#a3e635",
          color: "#0f172a",
          font: "bold 12px system-ui, sans-serif",
          padding: "0 4px",
          borderRadius: "4px",
          border: "1px solid #0f172a",
          pointerEvents: "none",
          lineHeight: "16px",
        } as CSSStyleDeclaration);
        box.appendChild(b);
      }
      document.body.appendChild(box);
    });
  }

  private async clearBadges(): Promise<void> {
    await this.page.evaluate(() => document.getElementById("fgw-badges")?.remove()).catch(() => {});
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
