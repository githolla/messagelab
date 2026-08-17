import { NextRequest, NextResponse } from "next/server";
import { captureUrl } from "@/lib/screenshot";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pure headless screenshot of a public URL — no model call, so no API key needed.
// Used by the Focus Group website kind to turn a link into a visual the panel reacts to.
export async function POST(req: NextRequest) {
  let url: string | undefined;
  try {
    ({ url } = (await req.json()) as { url?: string });
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }
  if (!url || !url.trim()) {
    return NextResponse.json({ error: "Provide a URL to capture." }, { status: 400 });
  }

  try {
    const shot = await captureUrl(url.trim());
    return NextResponse.json({ dataUrl: shot.dataUrl, note: shot.note });
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
}
