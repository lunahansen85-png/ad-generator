// Koer: npm test   (node:test via tsx — ingen netvaerk, ingen database)
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestVideoNames, stripExtension } from "./video-names";

test("VID 76 Hook 1-4: navnet stopper foer 'Hook', saa varianterne ikke bare er tal", () => {
  const r = suggestVideoNames(["VID 76 Hook 1.mov", "VID 76 Hook 2.mov", "VID 76 Hook 3.mov", "VID 76 Hook 4.mov"]);
  assert.deepEqual(r, { name: "VID 76", variants: ["Hook 1", "Hook 2", "Hook 3", "Hook 4"] });
});

test("Founder VSL: dobbelt mellemrum + bindestreg trimmes; faelles endelse bliver i varianten", () => {
  const r = suggestVideoNames([
    "Founder VSL  - Kort - 9x16.mov",
    "Founder VSL  - Mellem - 9x16.mov",
    "Founder VSL  - Lang - 9x16.mov",
    "Founder VSL  - Alternativt hook - 9x16.mov",
  ]);
  assert.deepEqual(r, {
    name: "Founder VSL",
    variants: ["Kort - 9x16", "Mellem - 9x16", "Lang - 9x16", "Alternativt hook - 9x16"],
  });
});

test("én fil: navn = filnavn uden endelse, variant = Hovedversion", () => {
  assert.deepEqual(suggestVideoNames(["Min video.mp4"]), { name: "Min video", variants: ["Hovedversion"] });
});

test("Hook 1 / Hook 10: praefikset klippes ikke midt i et tal", () => {
  const r = suggestVideoNames(["VID 9 Hook 1.mp4", "VID 9 Hook 10.mp4"]);
  assert.deepEqual(r, { name: "VID 9", variants: ["Hook 1", "Hook 10"] });
});

test("kun tal efter navnet og intet ord at tage med: navnet beholdes, varianten = hele filnavnet", () => {
  const r = suggestVideoNames(["Spot 1.mp4", "Spot 2.mp4"]);
  assert.deepEqual(r, { name: "Spot", variants: ["Spot 1", "Spot 2"] });
});

test("intet faelles praefiks: tomt navn (skrives i formularen), varianter = filnavnene", () => {
  assert.deepEqual(suggestVideoNames(["Kort.mov", "Lang.mov"]), { name: "", variants: ["Kort", "Lang"] });
});

test("en fil hvis navn ER praefikset: dens variant falder tilbage til filnavnet", () => {
  assert.deepEqual(suggestVideoNames(["Promo.mp4", "Promo - kort.mp4"]), {
    name: "Promo",
    variants: ["Promo", "kort"],
  });
});

test("stripExtension fjerner kun en rigtig endelse", () => {
  assert.equal(stripExtension("VID 76 Hook 1.mov"), "VID 76 Hook 1");
  assert.equal(stripExtension("Klip v1.2"), "Klip v1.2");
  assert.equal(stripExtension("UDEN_ENDELSE"), "UDEN_ENDELSE");
});
