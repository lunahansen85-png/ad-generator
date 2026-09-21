import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createMultipartUpload, presignUploadParts, PRESIGN_TTL_S } from "@/lib/storage";
import { isUuid, VIDEO_MAX_BYTES, VIDEO_PART_SIZE, VIDEO_TYPES, videoKey } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starter en multipart-upload for ÉN videofil og returnerer presignede URL'er til alle dele.
 * Browseren PUT'er delene direkte til bucket (ikke gennem appen — se lib/storage.ts), og kalder
 * bagefter /complete (eller /abort ved annullering).
 *
 * Body: { groupId?: uuid, contentType: "video/mp4" | "video/quicktime", size: bytes }
 * Første fil i en video sender intet groupId og faar et nyt; resten sender det samme med,
 * saa alle varianter havner under vid/<groupId>/.
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });

  const contentType = String(b.contentType ?? "");
  const ext = VIDEO_TYPES[contentType];
  if (!ext) {
    return NextResponse.json({ error: "Kun MP4- og MOV-videoer kan uploades." }, { status: 400 });
  }
  const size = Number(b.size);
  if (!Number.isSafeInteger(size) || size <= 0) {
    return NextResponse.json({ error: "Filen er tom." }, { status: 400 });
  }
  if (size > VIDEO_MAX_BYTES) {
    return NextResponse.json({ error: "Filen er større end 4 GB." }, { status: 400 });
  }
  const groupId = b.groupId == null ? randomUUID() : b.groupId;
  if (!isUuid(groupId)) return NextResponse.json({ error: "Ugyldigt video-id." }, { status: 400 });

  const assetId = randomUUID();
  const key = videoKey(groupId, assetId, ext);
  const partCount = Math.ceil(size / VIDEO_PART_SIZE);

  try {
    const uploadId = await createMultipartUpload(key, contentType);
    const urls = await presignUploadParts(
      key,
      uploadId,
      Array.from({ length: partCount }, (_, i) => i + 1)
    );
    return NextResponse.json({
      groupId,
      assetId,
      key,
      uploadId,
      partSize: VIDEO_PART_SIZE,
      partCount,
      urls,
      expiresAt: new Date(Date.now() + PRESIGN_TTL_S * 1000).toISOString(),
    });
  } catch (err) {
    console.error("CreateMultipartUpload fejlede", err);
    return NextResponse.json({ error: "Bucketen afviste uploaden. Prøv igen." }, { status: 502 });
  }
}
