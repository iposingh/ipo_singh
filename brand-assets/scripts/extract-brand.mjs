/**
 * Crops the approved IPO Singh sheet into separate assets.
 * Pixels are copied from the sheet. Nothing is redrawn or recolored.
 * Near-white sheet background is cleared only when it is connected to
 * the canvas edge, so interior white lettering stays intact.
 */
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(root, "brand-assets/source/ipo-singh-approved-sheet.png");
const webDir = path.join(root, "brand-assets/web");
const expoDir = path.join(root, "brand-assets/expo");
const publicDir = path.join(root, "apps/web/public/brand");
const appDir = path.join(root, "apps/web/app");

const crops = {
  horizontal: { left: 72, top: 158, width: 918, height: 307 },
  light: { left: 1099, top: 173, width: 298, height: 298 },
  dark: { left: 1451, top: 146, width: 314, height: 314 },
  only: { left: 1821, top: 149, width: 310, height: 310 },
};

function isSheetWhite(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min > 246 && max - min < 10;
}

function clearEdgeBackground(data, width, height, channels) {
  const seen = new Uint8Array(width * height);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = y * width + x;
    if (seen[offset]) return;
    const i = offset * channels;
    if (!isSheetWhite(data[i], data[i + 1], data[i + 2])) return;
    seen[offset] = 1;
    queue.push(offset);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (queue.length > 0) {
    const offset = queue.pop();
    const i = offset * channels;
    data[i + 3] = 0;
    const x = offset % width;
    const y = (offset - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

async function cropped(name, { clearBackground }) {
  const extracted = sharp(source).extract(crops[name]).ensureAlpha();
  if (!clearBackground) return extracted.png().toBuffer();
  const { data, info } = await extracted.raw().toBuffer({ resolveWithObject: true });
  clearEdgeBackground(data, info.width, info.height, info.channels);
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

async function squareResize(input, size) {
  return sharp(input)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function writePng(file, buffer) {
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(file);
}

async function main() {
  await mkdir(webDir, { recursive: true });
  await mkdir(expoDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  const horizontal = await cropped("horizontal", { clearBackground: true });
  const light = await cropped("light", { clearBackground: false });
  const dark = await cropped("dark", { clearBackground: true });
  const only = await cropped("only", { clearBackground: true });

  const logoMeta = await sharp(horizontal).metadata();
  if (!logoMeta.width || !logoMeta.height) throw new Error("Horizontal logo has no dimensions.");
  const logoForCard = await sharp(horizontal)
    .resize({ width: 880, height: 420, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const fitted = await sharp(logoForCard).metadata();
  const openGraph = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: "#F8FAFC",
    },
  })
    .composite([
      {
        input: logoForCard,
        left: Math.round((1200 - (fitted.width ?? 0)) / 2),
        top: Math.round((630 - (fitted.height ?? 0)) / 2),
      },
    ])
    .png()
    .toBuffer();

  const iconSizes = [32, 48, 180, 192, 512];
  const icons = new Map();
  for (const size of iconSizes) icons.set(size, await squareResize(only, size));

  const masters = [
    ["logo-horizontal.png", horizontal],
    ["icon-light.png", light],
    ["icon-dark.png", dark],
    ["icon-only.png", only],
    ["icon-32.png", icons.get(32)],
    ["icon-48.png", icons.get(48)],
    ["icon-192.png", icons.get(192)],
    ["icon-512.png", icons.get(512)],
    ["apple-touch-icon.png", icons.get(180)],
    ["og.png", openGraph],
  ];

  for (const [name, buffer] of masters) {
    await writePng(path.join(webDir, name), buffer);
    await writePng(path.join(publicDir, name), buffer);
  }

  await writePng(path.join(expoDir, "icon-light.png"), light);
  await writePng(path.join(expoDir, "icon-dark.png"), dark);
  await writePng(path.join(expoDir, "icon-only.png"), only);
  await writePng(path.join(expoDir, "icon-192.png"), icons.get(192));
  await writePng(path.join(expoDir, "icon-512.png"), icons.get(512));

  await copyFile(path.join(publicDir, "icon-192.png"), path.join(appDir, "icon.png"));
  await copyFile(path.join(publicDir, "apple-touch-icon.png"), path.join(appDir, "apple-icon.png"));
  await copyFile(path.join(publicDir, "og.png"), path.join(appDir, "opengraph-image.png"));

  const expected = {
    [path.join(webDir, "logo-horizontal.png")]: { width: logoMeta.width, height: logoMeta.height },
    [path.join(webDir, "icon-32.png")]: { width: 32, height: 32 },
    [path.join(webDir, "icon-48.png")]: { width: 48, height: 48 },
    [path.join(webDir, "icon-192.png")]: { width: 192, height: 192 },
    [path.join(webDir, "icon-512.png")]: { width: 512, height: 512 },
    [path.join(webDir, "apple-touch-icon.png")]: { width: 180, height: 180 },
    [path.join(webDir, "og.png")]: { width: 1200, height: 630 },
    [path.join(webDir, "icon-light.png")]: { width: 298, height: 298 },
    [path.join(webDir, "icon-dark.png")]: { width: 314, height: 314 },
    [path.join(webDir, "icon-only.png")]: { width: 310, height: 310 },
  };
  for (const [file, size] of Object.entries(expected)) {
    const meta = await sharp(file).metadata();
    if (meta.width !== size.width || meta.height !== size.height) {
      throw new Error(`${file} is ${meta.width}x${meta.height}, expected ${size.width}x${size.height}`);
    }
  }
  console.log("Brand assets written.");
  console.log(`Horizontal logo ${logoMeta.width}x${logoMeta.height}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
