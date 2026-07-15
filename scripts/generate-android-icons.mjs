// Generate Android launcher icons from public/favicon.svg using sharp,
// analoog aan generate-icons.mjs (PWA-iconen). Run with: npm run icons:android
//
// Overschrijft per dichtheid in android/app/src/main/res/mipmap-*:
//   ic_launcher.png            legacy icoon, #141416-achtergrond
//   ic_launcher_round.png      idem (Android maskt zelf rond)
//   ic_launcher_foreground.png adaptieve voorgrond, transparant, art binnen
//                              de safe zone (~45% van het canvas)
// en zet values/ic_launcher_background.xml op #141416.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resDir = path.join(root, "android", "app", "src", "main", "res");
const svg = await readFile(path.join(root, "public", "favicon.svg"));

const BG = "#141416";

// dp-groottes per dichtheid: legacy 48dp, adaptieve laag 108dp.
const DENSITIES = [
  { dir: "mipmap-mdpi", legacy: 48, adaptive: 108 },
  { dir: "mipmap-hdpi", legacy: 72, adaptive: 162 },
  { dir: "mipmap-xhdpi", legacy: 96, adaptive: 216 },
  { dir: "mipmap-xxhdpi", legacy: 144, adaptive: 324 },
  { dir: "mipmap-xxxhdpi", legacy: 192, adaptive: 432 },
];

async function render({ out, size, art, background }) {
  const artPng = await sharp(svg, { density: 300 }).resize(art, art).png().toBuffer();
  const pad = Math.round((size - art) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: artPng, left: pad, top: pad }])
    .png()
    .toFile(out);
  console.log(`  ${path.relative(root, out)} (${size}x${size}, art ${art}px)`);
}

for (const { dir, legacy, adaptive } of DENSITIES) {
  const base = path.join(resDir, dir);
  const legacyArt = Math.round(legacy * 0.72);
  await render({ out: path.join(base, "ic_launcher.png"), size: legacy, art: legacyArt, background: BG });
  await render({ out: path.join(base, "ic_launcher_round.png"), size: legacy, art: legacyArt, background: BG });
  // Safe zone van een adaptief icoon is de binnenste 66/108; hou de art daar
  // ruim binnen zodat cirkel/squircle-masks niets afsnijden.
  await render({
    out: path.join(base, "ic_launcher_foreground.png"),
    size: adaptive,
    art: Math.round(adaptive * 0.45),
  });
}

await writeFile(
  path.join(resDir, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>`,
);
console.log("  values/ic_launcher_background.xml → " + BG);
