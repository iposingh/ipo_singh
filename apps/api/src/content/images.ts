/** News cover upload limit (5 MB). */
export const articleImageLimit = 5_000_000;

export type ArticleImageType = "image/png" | "image/jpeg" | "image/webp";

export type InspectedArticleImage = {
  contentType: ArticleImageType;
  width: number;
  height: number;
};

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function within(width: number, height: number): boolean {
  return width >= 1 && height >= 1 && width <= 4000 && height <= 4000;
}

function pngSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 24 || !data.subarray(0, 8).equals(pngSignature)) return null;
  if (data.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (!within(width, height)) return null;
  return { width, height };
}

function jpegSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) return null;
  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1] ?? 0;
    if (marker === 0xd8) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = data.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > data.length) return null;
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) {
      const height = data.readUInt16BE(offset + 5);
      const width = data.readUInt16BE(offset + 7);
      if (!within(width, height)) return null;
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 30) return null;
  if (data.subarray(0, 4).toString("ascii") !== "RIFF" || data.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  const chunk = data.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    const width = 1 + data.readUIntLE(24, 3);
    const height = 1 + data.readUIntLE(27, 3);
    if (!within(width, height)) return null;
    return { width, height };
  }
  if (chunk === "VP8 " && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    const width = data.readUInt16LE(26) & 0x3fff;
    const height = data.readUInt16LE(28) & 0x3fff;
    if (!within(width, height)) return null;
    return { width, height };
  }
  if (chunk === "VP8L" && data[20] === 0x2f) {
    const bits = data.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (!within(width, height)) return null;
    return { width, height };
  }
  return null;
}

/** Accepts PNG, JPEG, or WebP whose declared type matches file bytes. */
export function inspectArticleImage(contentType: string, data: Buffer): InspectedArticleImage | null {
  const type = contentType.split(";")[0]?.trim().toLowerCase();
  if (data.length < 24 || data.length > articleImageLimit) return null;
  if (type === "image/png") {
    const size = pngSize(data);
    return size ? { contentType: "image/png", ...size } : null;
  }
  if (type === "image/jpeg") {
    const size = jpegSize(data);
    return size ? { contentType: "image/jpeg", ...size } : null;
  }
  if (type === "image/webp") {
    const size = webpSize(data);
    return size ? { contentType: "image/webp", ...size } : null;
  }
  return null;
}
