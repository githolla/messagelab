import { NextRequest, NextResponse } from "next/server";
import { industry } from "@/lib/industries";
import { assertPublicUrl } from "@/lib/net";
import { callModel, extractJson, ModelError } from "@/lib/anthropic";

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
  // SSRF guard: http(s) only AND the hostname must resolve entirely to public
  // addresses — no loopback/private/link-local ranges or the metadata IP.
  const safeUrl = await assertPublicUrl(url);
  const target = new URL(safeUrl);

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
    // Redirect-escape guard: a public URL can 3xx to an internal host, so
    // re-validate where we actually landed before screenshotting it.
    await assertPublicUrl(page.url());
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

  let url: string | undefined;
  let image: string | undefined;
  let industryKey: string | undefined;
  let context: string | undefined;
  try {
    const parsed = (await req.json()) as {
      url?: string;
      image?: string;
      industry?: string;
      context?: string;
    };
    ({ url, image, industry: industryKey, context } = parsed);
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const ind = industry(industryKey);
  const focusParts: string[] = [];
  if (ind && ind.key !== "general") focusParts.push(`This is a ${ind.label} page. ${ind.guidance}`);
  if (context && context.trim())
    focusParts.push(`Additional context from the reviewer: ${context.trim().slice(0, 600)}`);
  const focus = focusParts.length
    ? `\n\n## Focus for this review\n${focusParts.join("\n")}`
    : "";

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

  const m = shot.dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return NextResponse.json({ error: "Screenshot encoding failed." }, { status: 500 });

  const model = process.env.MESSAGE_LAB_MODEL || "claude-sonnet-4-6";
  let text: string;
  try {
    text = await callModel({
      apiKey,
      model,
      maxTokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Review this web page for UI/UX and usability.${focus}\n\n${REVIEW_SCHEMA}`,
            },
            { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          ],
        },
      ],
    });
  } catch (e) {
    const err = e instanceof ModelError ? e : new ModelError(502, "unknown error");
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  try {
    const review = extractJson(text);
    return NextResponse.json({
      review,
      screenshot: shot.dataUrl,
      note: shot.note,
      model,
      industry: ind?.label ?? "General / other",
    });
  } catch {
    return NextResponse.json({ error: "Review JSON failed to parse." }, { status: 502 });
  }
}
