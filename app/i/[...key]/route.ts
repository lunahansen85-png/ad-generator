import { NextRequest } from "next/server";
import { getImage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Offentlig, permanent billed-URL: /i/<bucket-noegle>
 *
 * Denne rute er MED VILJE undtaget fra password-gaten i proxy.ts:
 * baade Ad Studio og Meta skal kunne hente billedet uden login, og
 * Metas ads_creative_upload_image henter URL'en server-til-server.
 * URL'en udloeber aldrig (i modsaetning til presigned URLs).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> }
) {
  const { key } = await ctx.params;
  const objectKey = key.join("/");

  // Videoer (op til 4 GB) maa ikke hentes her: denne rute lægger hele objektet i hukommelsen.
  // De serveres som stream af /v/<noegle>. Billeder er uberoerte af dette tjek.
  if (objectKey.startsWith("vid/")) {
    return new Response("Billedet findes ikke.", { status: 404 });
  }

  try {
    const { body, contentType } = await getImage(objectKey);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Billedet findes ikke.", { status: 404 });
  }
}
