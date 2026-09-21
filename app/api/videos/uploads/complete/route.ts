import { NextRequest, NextResponse } from "next/server";
import { completeMultipartUpload } from "@/lib/storage";
import { VIDEO_KEY_RE } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Afslutter en multipart-upload: bucketen saetter delene sammen til én fil.
 * Body: { key, uploadId, parts: [{ partNumber, etag }] } — etag praecis som bucketen sendte den
 * i svaret paa hver dels PUT (kraever ExposeHeaders: ETag i bucketens CORS, se scripts/set-bucket-cors.mjs).
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const key = String(b?.key ?? "");
  const uploadId = String(b?.uploadId ?? "");
  const raw: unknown[] = Array.isArray(b?.parts) ? b.parts : [];
  if (!VIDEO_KEY_RE.test(key) || !uploadId || uploadId.length > 1024) {
    return NextResponse.json({ error: "Ugyldig upload." }, { status: 400 });
  }
  const parts = raw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { partNumber: Number(o.partNumber), etag: String(o.etag ?? "") };
  });
  const ok =
    parts.length > 0 &&
    parts.length <= 10_000 &&
    parts.every((p) => Number.isInteger(p.partNumber) && p.partNumber >= 1 && p.etag.length > 0 && p.etag.length < 200) &&
    new Set(parts.map((p) => p.partNumber)).size === parts.length;
  if (!ok) return NextResponse.json({ error: "Ugyldige dele." }, { status: 400 });

  try {
    await completeMultipartUpload(key, uploadId, parts);
    return NextResponse.json({ ok: true, key });
  } catch (err) {
    console.error("CompleteMultipartUpload fejlede", err);
    return NextResponse.json({ error: "Bucketen kunne ikke samle filen. Prøv igen." }, { status: 502 });
  }
}
