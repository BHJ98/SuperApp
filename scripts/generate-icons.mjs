// Generate PWA icons from public/favicon.svg using sharp.
// Run with: npm run icons
//
// Outputs (all in public/):
//   icon-192.png           192x192, transparent, art edge-to-edge (purpose "any")
//   icon-512.png           512x512, transparent, art edge-to-edge (purpose "any")
//   icon-maskable-512.png  512x512, solid #141416 background, ~20% safe-zone
//                          padding so the art survives circular/squircle masks
//                          (purpose "maskable")
//   apple-touch-icon.png   180x180, solid #141416 background, slight padding
//                          (iOS home screen; iOS applies its own corner radius)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const svg = await readFile(path.join(publicDir, "favicon.svg"));

const BG = "#141416";

/** Render the SVG at `art` px and center it on a `size` px canvas. */
async function render({ out, size, art = size, background }) {
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
    .toFile(path.join(publicDir, out));
  console.log(`  ${out} (${size}x${size}${art !== size ? `, art ${art}px` : ""})`);
}

console.log("Generating PWA icons from public/favicon.svg …");
await render({ out: "icon-192.png", size: 192 });
await render({ out: "icon-512.png", size: 512 });
// Maskable: ~20% total padding (art at 80% of canvas) keeps the art inside the
// 80% safe zone that launcher masks are guaranteed to show.
await render({ out: "icon-maskable-512.png", size: 512, art: 410, background: BG });
// Apple touch icon: slight padding on a solid background.
await render({ out: "apple-touch-icon.png", size: 180, art: 150, background: BG });
console.log("Done.");
