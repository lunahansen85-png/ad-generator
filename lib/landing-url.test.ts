// Koer: npm test   (node:test via tsx — ingen netvaerk, ingen database)
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliserLandingUrl } from "./landing-url";

test("de tre kendte landingssider gemmes praecis som de staar", () => {
  for (const url of [
    "https://kjeldgaards.com/morten/",
    "https://kjeldgaards.com/indkapslet/",
    "https://kjeldgaards.com/listicle01/",
  ]) {
    assert.deepEqual(normaliserLandingUrl(url), { ok: true, url });
  }
});

test("tom vaerdi er tilladt og betyder ingen standard", () => {
  assert.deepEqual(normaliserLandingUrl(""), { ok: true, url: "" });
  assert.deepEqual(normaliserLandingUrl("   "), { ok: true, url: "" });
});

test("uden protokol bliver det https", () => {
  assert.deepEqual(normaliserLandingUrl("kjeldgaards.com/morten"), {
    ok: true,
    url: "https://kjeldgaards.com/morten",
  });
});

test("http accepteres, andre protokoller afvises paa dansk", () => {
  assert.equal(normaliserLandingUrl("http://kjeldgaards.com/").ok, true);
  const r = normaliserLandingUrl("ftp://kjeldgaards.com/");
  assert.deepEqual(r, { ok: false, fejl: "Landingssiden skal starte med http:// eller https://" });
});

test("vaerdier der ikke er adresser afvises", () => {
  for (const bad of ["morten", "https://", "kjeldgaards com/morten", 42, null]) {
    assert.equal(normaliserLandingUrl(bad as unknown).ok, false, `skulle vaere afvist: ${String(bad)}`);
  }
});

test("query og anker bevares — UTM'er maa ikke forsvinde", () => {
  assert.deepEqual(normaliserLandingUrl("https://kjeldgaards.com/morten/?x=1#top"), {
    ok: true,
    url: "https://kjeldgaards.com/morten/?x=1#top",
  });
});
