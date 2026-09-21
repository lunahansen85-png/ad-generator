import { NextRequest, NextResponse } from "next/server";
import { presignPut, PRESIGN_TTL_S } from "@/lib/storage";
import { isUuid, thumbKey } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Presigneret PUT til videoens thumbnail (JPEG lavet i browseren). Body: { groupId, assetId }.
 * Browseren skal sende "Content-Type: image/jpeg" med sin PUT (se presignPut i lib/storage.ts).
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.groupId) || !isUuid(b?.assetId)) {
    return NextResponse.json({ error: "Ugyldigt video-id." }, { status: 400 });
  }
  const key = thumbKey(b.groupId, b.assetId);
  try {
    const url = await presignPut(key, "image/jpeg");
    return NextResponse.json({
      thumbKey: key,
      url,
      expiresAt: new Date(Date.now() + PRESIGN_TTL_S * 1000).toISOString(),
    });
  } catch (err) {
    console.error("Presign af thumbnail fejlede", err);
    return NextResponse.json({ error: "Kunne ikke gøre klar til thumbnail-upload." }, { status: 502 });
  }
}
