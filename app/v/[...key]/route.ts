import { NextRequest } from "next/server";
import { getObjectStream, headObject, isInvalidRange, isNotFound } from "@/lib/storage";
import { VIDEO_KEY_RE } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Offentlig, permanent video-URL: /v/<bucket-noegle>   (kun noegler under vid/)
 *
 * Som /i/* er ruten MED VILJE undtaget fra password-gaten i proxy.ts: Metas servere henter
 * videoen fra https://adgen.kjeldgaards.com/v/<noegle> uden login.
 *
 * Forskellen fra /i/*: en video kan vaere op til 4 GB og maa ALDRIG laegges i hukommelsen.
 * Bucketens svar sendes videre som en web-stream: Response(<ReadableStream>). Fremgangsmaaden
 * foelger Next-dokumentationen for denne version, node_modules/next/dist/docs/01-app/02-guides/
 * streaming.md, afsnittet "Streaming in Route Handlers" ("stream files without loading them
 * entirely into memory … return new Response(<web ReadableStream>, { headers })").
 *
 * Range ("bytes=start-slut") sendes videre til bucketen → 206 + Content-Range, saa browsere kan
 * spole og Meta kan hente i bidder. Accept-Ranges: bytes paa alle svar.
 *
 * OBS: Railways docs (docs.railway.com/networking/public-networking/specs-and-limits, laest
 * 22.09.2026): "HTTP requests can run for up to 15 minutes if data keeps transferring". Gaelder det
 * ogsaa svaret, skal en hel 4 GB-fil hentes med mindst ca. 36 Mbit/s i én request.
 */

const CACHE = "public, max-age=31536000, immutable"; // noeglen er unik pr. fil og aendres aldrig

function objectKey(parts: string[]) {
  const key = parts.join("/");
  return VIDEO_KEY_RE.test(key) ? key : null;
}

const typeFromKey = (key: string) => (key.endsWith(".mov") ? "video/quicktime" : "video/mp4");

/**
 * Kun ÉN range understoettes ("bytes=0-1023", "bytes=1024-", "bytes=-500"). Flere ranges eller et
 * ugyldigt format ignoreres, og hele filen sendes med 200 — det maa en server gerne (RFC 9110 §14.2).
 */
function singleRange(header: string | null) {
  const h = header?.trim();
  if (!h) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h);
  if (!m || (m[1] === "" && m[2] === "")) return undefined;
  return h;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = objectKey(parts);
  if (!key) return new Response("Videoen findes ikke.", { status: 404 });

  const range = singleRange(req.headers.get("range"));
  try {
    const obj = await getObjectStream(key, range, req.signal);
    const headers = new Headers({
      "Content-Type": obj.contentType ?? typeFromKey(key),
      "Accept-Ranges": "bytes",
      "Cache-Control": CACHE,
    });
    if (obj.contentLength != null) headers.set("Content-Length", String(obj.contentLength));
    if (obj.etag) headers.set("ETag", obj.etag);
    if (obj.lastModified) headers.set("Last-Modified", obj.lastModified.toUTCString());

    if (range && obj.contentRange) {
      headers.set("Content-Range", obj.contentRange);
      return new Response(obj.body, { status: 206, headers });
    }
    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    if (isNotFound(err)) return new Response("Videoen findes ikke.", { status: 404 });
    if (isInvalidRange(err)) {
      // 416 skal fortaelle filens fulde stoerrelse: "Content-Range: bytes */<stoerrelse>".
      const head = await headObject(key).catch(() => null);
      const h = new Headers({ "Accept-Ranges": "bytes" });
      if (head) h.set("Content-Range", `bytes */${head.bytes}`);
      return new Response(null, { status: 416, headers: h });
    }
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("Video-GET fejlede", err);
    return new Response("Videoen kunne ikke hentes lige nu.", { status: 502 });
  }
}

/** HEAD: samme headere som GET, uden at hente selve videoen fra bucketen. */
export async function HEAD(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = objectKey(parts);
  if (!key) return new Response(null, { status: 404 });
  try {
    const head = await headObject(key);
    if (!head) return new Response(null, { status: 404 });
    const headers = new Headers({
      "Content-Type": head.contentType ?? typeFromKey(key),
      "Content-Length": String(head.bytes),
      "Accept-Ranges": "bytes",
      "Cache-Control": CACHE,
    });
    if (head.etag) headers.set("ETag", head.etag);
    if (head.lastModified) headers.set("Last-Modified", head.lastModified.toUTCString());
    return new Response(null, { status: 200, headers });
  } catch (err) {
    console.error("Video-HEAD fejlede", err);
    return new Response(null, { status: 502 });
  }
}
