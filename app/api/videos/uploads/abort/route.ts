import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload, isNotFound } from "@/lib/storage";
import { VIDEO_KEY_RE } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Annullerer en igangvaerende multipart-upload, saa bucketen smider de dele vaek, der allerede
 * er sendt (ellers ligger de og fylder uden at kunne ses). Body: { key, uploadId }.
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const key = String(b?.key ?? "");
  const uploadId = String(b?.uploadId ?? "");
  if (!VIDEO_KEY_RE.test(key) || !uploadId || uploadId.length > 1024) {
    return NextResponse.json({ error: "Ugyldig upload." }, { status: 400 });
  }
  try {
    await abortMultipartUpload(key, uploadId);
  } catch (err) {
    // Allerede afsluttet/annulleret (NoSuchUpload = 404) er ikke en fejl her.
    if (!isNotFound(err) && (err as { name?: string })?.name !== "NoSuchUpload") {
      console.error("AbortMultipartUpload fejlede", err);
      return NextResponse.json({ error: "Kunne ikke annullere uploaden i bucketen." }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true });
}
