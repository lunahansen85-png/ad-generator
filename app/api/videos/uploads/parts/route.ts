import { NextRequest, NextResponse } from "next/server";
import { presignUploadParts, PRESIGN_TTL_S } from "@/lib/storage";
import { VIDEO_KEY_RE } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nye presignede URL'er til dele af en igangvaerende upload. De foerste URL'er gaelder 1 time;
 * en stor fil paa en langsom forbindelse kan tage laengere, og saa henter browseren friske her.
 *
 * Body: { key, uploadId, partNumbers: number[] }
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const key = String(b?.key ?? "");
  const uploadId = String(b?.uploadId ?? "");
  const nums: unknown[] = Array.isArray(b?.partNumbers) ? b.partNumbers : [];
  if (!VIDEO_KEY_RE.test(key) || !uploadId || uploadId.length > 1024) {
    return NextResponse.json({ error: "Ugyldig upload." }, { status: 400 });
  }
  if (nums.length === 0 || nums.length > 1000 || !nums.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 10_000)) {
    return NextResponse.json({ error: "Ugyldige delnumre." }, { status: 400 });
  }

  try {
    const urls = await presignUploadParts(key, uploadId, nums as number[]);
    return NextResponse.json({ urls, expiresAt: new Date(Date.now() + PRESIGN_TTL_S * 1000).toISOString() });
  } catch (err) {
    console.error("Presign af dele fejlede", err);
    return NextResponse.json({ error: "Kunne ikke forny upload-adresserne." }, { status: 502 });
  }
}
