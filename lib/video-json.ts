import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videoGroup, type VideoAssetRow, type VideoGroupRow } from "@/db/schema";

/**
 * JSON-formen for én video i GET /api/videos. Ad Push (Meta CSV Upload) laeser den — felterne og
 * deres navne maa ikke aendres uden at Ad Push aendres med.
 *
 * url      = den faste offentlige video-URL (/v/<key>), som Meta henter videoen fra.
 * thumbUrl = thumbnailen via den eksisterende billed-rute (/i/<thumbKey>).
 * Begge bygges af publicOrigin() — praecis som CSV-eksporten bygger billed-URL'erne.
 */
export function toGroupJson(g: VideoGroupRow & { assets: VideoAssetRow[] }, origin: string) {
  return {
    id: g.id,
    category: g.category,
    name: g.name,
    metaPrimaryText: g.metaPrimaryText,
    metaHeadline: g.metaHeadline,
    note: g.note,
    archived: g.archived,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    videos: sortAssets(g.assets).map((a) => ({
      id: a.id,
      variant: a.variant,
      filename: a.filename,
      key: a.key,
      thumbKey: a.thumbKey,
      url: `${origin}/v/${a.key}`,
      thumbUrl: a.thumbKey ? `${origin}/i/${a.thumbKey}` : null,
      contentType: a.contentType,
      bytes: a.bytes,
      width: a.width,
      height: a.height,
      durationS: a.durationS,
      favorite: a.favorite,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export type VideoGroupJson = ReturnType<typeof toGroupJson>;

// Varianter uploadet sammen faar samme created_at — "naturlig" sortering paa navnet giver
// "Hook 1, Hook 2 … Hook 10" i den raekkefoelge man forventer.
function sortAssets(list: VideoAssetRow[]) {
  return [...list].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.variant.localeCompare(b.variant, "da", { numeric: true })
  );
}

export async function loadGroup(id: string) {
  return db.query.videoGroup.findFirst({
    where: eq(videoGroup.id, id),
    with: { assets: true },
  });
}
