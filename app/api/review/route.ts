import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const REVIEW_SCHEMA = `Respond with ONLY a JSON object, no markdown fences:
{
  "summary": "2-3 sentence overall read of the page's UI/UX and usability",
  "scores": {
    "hierarchy": 1-5, "clarity": 1-5, "navigation": 1-5,
    "cta": 1-5, "trust": 1-5, "accessibility": 1-5
  },
  "strengths": ["..."],
  "issues": [
    {"severity": "high" | "medium" | "low", "area": "e.g. hierarchy, navigation, CTA, content, trust, accessibility, layout", "finding": "what's wrong and why it hurts usability or conversion", "fix": "the concrete change to make"}
  ]
}
Score keys: hierarchy = visual hierarchy & layout; clarity = clarity of purpose & content; navigation = navigation & information architecture; cta = primary call-to-action & user flow; trust = trust & credibility; accessibility = contrast, target sizes, legibility.
Order issues most severe first. Be specific to what is visible in the screenshot — no generic advice.`;

const SYSTEM =
  "You are a senior UI/UX designer and usability expert. You review web pages the way a design lead and usability specialist would in a crit: visual hierarchy and layout, clarity of purpose and content, navigation and information architecture, the primary call-to-action and user flow, trust and credibility, and accessibility (contrast, target sizes, legibility, and any focus/state cues that are visible). Evidence-driven, blunt, and practical — ground every point in what is actually visible in the screenshot.";

type Shot = { dataUrl: string; note: string };

async function capture(url: string): Promise<Shot> {
  // Validate + normalize the URL; only http(s).
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http(s) URLs can be captured.");
  }

  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_VERSION || process.env.VERCEL === "1";
  const puppeteer = (await import("puppeteer-core")).default;

  let executablePath: string;
  let args: string[];
  const headless = true;
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    // Local/dev: use a system Chromium (this container ships one for Playwright).
    executablePath =
      process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/opt/pw-browsers/chromium";
    args = ["--no-sandbox", "--disable-setuid-sandbox"];
  }

  const browser = await puppeteer.launch({ executablePath, args, headless });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(target.toString(), { waitUntil: "networkidle2", timeout: 30000 });
    // Above-the-fold + a bit more is what a donor first meets; cap height so the
    // vision payload stays small.
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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const { url, image } = (await req.json()) as { url?: string; image?: string };

  let shot: Shot;
  if (image) {
    const m = image.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return NextResponse.json({ error: "Unsupported image format." }, { status: 400 });
    shot = { dataUrl: image, note: "Reviewed an uploaded screenshot." };
  } else if (url) {
    try {
      shot = await capture(url);
    } catch (e) {
      return NextResponse.json(
        {
          error: `Couldn't capture that URL (${
            e instanceof Error ? e.message : "unknown error"
          }). Some sites block headless browsers or need a login — upload a screenshot instead.`,
        },
        { status: 502 }
      );
    }
  } else {
    return NextResponse.json({ error: "Provide a URL or a screenshot." }, { status: 400 });
  }

  const m = shot.dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return NextResponse.json({ error: "Screenshot encoding failed." }, { status: 500 });

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Review this web page for UI/UX and usability. ${REVIEW_SCHEMA}`,
            },
            { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return NextResponse.json(
      { error: `Model call failed (${resp.status}): ${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const data = await resp.json();
  const text: string = data.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "Model returned no parseable review." }, { status: 502 });
  }
  try {
    const review = JSON.parse(match[0]);
    return NextResponse.json({ review, screenshot: shot.dataUrl, note: shot.note, model });
  } catch {
    return NextResponse.json({ error: "Review JSON failed to parse." }, { status: 502 });
  }
}
