import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { videoAsset, videoGroup } from "@/db/schema";
import { publicOrigin } from "@/lib/public-url";
import { headObject } from "@/lib/storage";
import { isCategoryId, isUuid, thumbKey, videoKey } from "@/lib/video";
import { loadGroup, toGroupJson } from "@/lib/video-json";
import { landingUrlMap } from "@/lib/category-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hele videobiblioteket — ogsaa arkiverede grupper (archived: true); klienterne filtrerer selv.
 * Ad Push afhaenger af formen (se lib/video-json.ts).
 */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const [groups, landingUrls] = await Promise.all([
    db.query.videoGroup.findMany({
      orderBy: [desc(videoGroup.createdAt)],
      with: { assets: true },
    }),
    landingUrlMap(),
  ]);
  return NextResponse.json({
    groups: groups.map((g) => toGroupJson(g, origin, landingUrls)),
    landingUrls,
  });
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function posInt(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : null;
}

/**
 * Registrerer én video (gruppe) med dens varianter, EFTER browseren har uploadet filerne direkte
 * til bucket. Hver fil og hver thumbnail tjekkes med HeadObject — intet gemmes i databasen, som
 * ikke findes i bucket. Stoerrelse og type tages fra bucketen, ikke fra browseren.
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Ugyldig forespørgsel.");

  const groupId = b.groupId;
  if (!isUuid(groupId)) return bad("Ugyldigt video-id.");
  const category = String(b.category ?? "");
  if (!isCategoryId(category)) return bad("Vælg en kategori.");
  const name = String(b.name ?? "").trim();
  if (!name) return bad("Videoen skal have et navn.");

  const list: unknown[] = Array.isArray(b.videos) ? b.videos : [];
  if (list.length === 0) return bad("Ingen videofiler at gemme.");
  if (list.length > 50) return bad("Højst 50 varianter pr. video.");

  const seen = new Set<string>();
  const parsed = [];
  for (const raw of list) {
    const v = (raw ?? {}) as Record<string, unknown>;
    const assetId = v.assetId;
    if (!isUuid(assetId) || seen.has(assetId)) return bad("Ugyldigt fil-id.");
    seen.add(assetId);
    const variant = String(v.variant ?? "").trim();
    if (!variant) return bad("Alle varianter skal have et navn.");
    const key = String(v.key ?? "");
    if (key !== videoKey(groupId, assetId, "mp4") && key !== videoKey(groupId, assetId, "mov")) {
      return bad("Ugyldig filnøgle.");
    }
    const tKey = thumbKey(groupId, assetId);
    if (v.thumbKey !== tKey) return bad(`Thumbnail mangler for “${variant}”.`);
    const duration = Number(v.durationS);
    parsed.push({
      id: assetId,
      groupId,
      variant,
      filename: String(v.filename ?? "").slice(0, 300) || null,
      key,
      thumbKey: tKey,
      width: posInt(v.width),
      height: posInt(v.height),
      durationS: Number.isFinite(duration) && duration > 0 ? duration : null,
    });
  }

  // Findes filerne virkelig i bucket? (Meta kraever thumbnail til videoannoncer — bevist 21.09.)
  let heads;
  try {
    heads = await Promise.all(
      parsed.map(async (p) => ({ video: await headObject(p.key), thumb: await headObject(p.thumbKey) }))
    );
  } catch (err) {
    console.error("HeadObject fejlede", err);
    return bad("Kunne ikke tjekke filerne i bucketen. Prøv igen.", 502);
  }
  const rows: (typeof videoAsset.$inferInsert)[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const { video, thumb } = heads[i];
    if (!video || video.bytes <= 0) return bad(`Videofilen “${p.variant}” findes ikke i bucketen — upload den igen.`);
    if (!thumb || thumb.bytes <= 0) return bad(`Thumbnail mangler for “${p.variant}” — upload videoen igen.`);
    rows.push({
      ...p,
      bytes: video.bytes,
      contentType: video.contentType ?? (p.key.endsWith(".mov") ? "video/quicktime" : "video/mp4"),
    });
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(videoGroup).values({
        id: groupId,
        category,
        name,
        metaPrimaryText: String(b.metaPrimaryText ?? ""),
        metaHeadline: String(b.metaHeadline ?? ""),
        note: String(b.note ?? ""),
      });
      await tx.insert(videoAsset).values(rows);
    });
  } catch (err) {
    // 23505 = unique_violation: samme video sendt to gange (fx dobbeltklik). Drizzle pakker
    // pg-fejlen ind, saa koden kan sidde paa selve fejlen eller paa dens `cause`.
    const e = err as { code?: string; cause?: { code?: string } };
    if (e?.code === "23505" || e?.cause?.code === "23505") return bad("Videoen er allerede gemt.", 409);
    throw err;
  }

  const group = await loadGroup(groupId);
  return NextResponse.json({
    group: group ? toGroupJson(group, publicOrigin(req), await landingUrlMap()) : null,
  });
}
