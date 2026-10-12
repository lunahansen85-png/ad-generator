// Koer: npm test   (node:test via tsx — ingen netvaerk, ingen database)
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByLayouts, layoutStem, layoutsForCategory } from "./layouts";
import { mortenTemplates } from "./templates/morten";
import { testimonialFormatTemplates } from "./templates/testimonial";

// Samme filter som lib/generate.ts bruger FOER layout-valget: kun skabeloner med maal renderes.
const mortenRendered = mortenTemplates.filter((t) => t.width && t.height);

test("stammen er uden format-endelse, og tp_stars har sit alias", () => {
  assert.equal(layoutStem("morten_3_1080x1080"), "morten_3");
  assert.equal(layoutStem("morten_3_9x16"), "morten_3");
  assert.equal(layoutStem("morten_3"), "morten_3");
  assert.equal(layoutStem("template_tp_stars_9x16"), "template_tp_stars");
  assert.equal(layoutStem("tp_stars"), "template_tp_stars");
});

test("tomt valg giver listen UAENDRET — dagens opfoersel", () => {
  assert.equal(filterByLayouts(mortenRendered, []).length, mortenRendered.length);
  assert.equal(filterByLayouts(mortenRendered, undefined).length, mortenRendered.length);
  assert.equal(filterByLayouts(mortenRendered, null).length, mortenRendered.length);
  assert.equal(mortenRendered.length, 20, "morten renderer 20 billeder uden et valg");
});

test("ét layout giver PRAECIS 2 skabeloner: 1:1 + 9:16", () => {
  const ud = filterByLayouts(mortenRendered, ["morten_3"]);
  assert.equal(ud.length, 2);
  assert.deepEqual(ud.map((t) => t.id).sort(), ["morten_3_1080x1080", "morten_3_9x16"]);
});

test("ukendte navne springes over — de kendte kommer stadig med", () => {
  const ud = filterByLayouts(mortenRendered, ["morten_3", "findes_ikke", "retinol_1"]);
  assert.deepEqual(ud.map((t) => t.id).sort(), ["morten_3_1080x1080", "morten_3_9x16"]);
});

test("kun ukendte navne er en dansk fejl, aldrig nul billeder i tavshed", () => {
  assert.throws(() => filterByLayouts(mortenRendered, ["findes_ikke"]), /Ingen skabeloner passer/);
});

test("tp_stars kan vaelges og rammer begge formater", () => {
  const ud = filterByLayouts(testimonialFormatTemplates, ["tp_stars"]);
  assert.deepEqual(ud.map((t) => t.id).sort(), [
    "template_tp_stars_1080x1080",
    "template_tp_stars_9x16",
  ]);
});

test("listen pr. kategori: morten 10, retinol 10, testimonial 11", () => {
  assert.equal(layoutsForCategory("morten").length, 10);
  assert.equal(layoutsForCategory("retinol").length, 10);
  assert.equal(layoutsForCategory("testimonial").length, 11);
  assert.deepEqual(layoutsForCategory("morten")[2], { stem: "morten_3", label: "Morten 3" });
  assert.ok(layoutsForCategory("testimonial").some((l) => l.stem === "template_tp_stars"));
  assert.deepEqual(layoutsForCategory("findes-ikke"), []);
});
