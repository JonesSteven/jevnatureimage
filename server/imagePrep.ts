import sharp, { type Metadata, type OutputInfo } from "sharp";

// Documented image limits (docs.typesafe.ai/images). Images outside them are rejected, not resized,
// so we normalize here: upright pixels, each side 256..1568 px, 78,400..2,458,624 px total, baseline JPEG.
const MAX_SIDE = 1568;
const MIN_SIDE = 256;
const MIN_PIXELS = 78_400;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

export class ImagePrepError extends Error {}

export interface PreparedImage {
  jpeg: Buffer;
  width: number;
  height: number;
  originalFormat: string;
  resized: boolean;
}

export async function prepareImage(input: Buffer): Promise<PreparedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImagePrepError("That file isn't an image we can read. Try a JPEG or PNG.");
  }
  const originalFormat = meta.format ?? "unknown";

  // EXIF is stripped by the API and orientation is not applied, so bake rotation into the pixels.
  // `pages: 1` keeps only the first frame of animated GIF/WebP/PNG.
  let decoded: { data: Buffer; info: OutputInfo };
  try {
    decoded = await sharp(input, { pages: 1 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // JPEG has no alpha
      .raw() // keep pixels lossless until the single JPEG encode below
      .toBuffer({ resolveWithObject: true });
  } catch {
    const heic = originalFormat === "heif";
    throw new ImagePrepError(
      heic
        ? "HEIC photos aren't supported here. Export it as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible) and try again."
        : `Couldn't decode this ${originalFormat} image. Try exporting it as JPEG or PNG.`,
    );
  }

  let { width, height } = decoded.info;
  let resized = width !== (meta.autoOrient?.width ?? meta.width) || height !== (meta.autoOrient?.height ?? meta.height);

  // Upscale (never pad, so Box fractions still map onto the photo) when below the minimums.
  const scale = Math.max(1, MIN_SIDE / Math.min(width, height), Math.sqrt(MIN_PIXELS / (width * height)));
  let pipeline = sharp(decoded.data, { raw: { width, height, channels: decoded.info.channels } });
  if (scale > 1) {
    const w = Math.ceil(width * scale);
    const h = Math.ceil(height * scale);
    if (Math.max(w, h) > MAX_SIDE) {
      throw new ImagePrepError(
        `This image is too narrow (${width}×${height}). Jev needs every side between ${MIN_SIDE} and ${MAX_SIDE} px; crop it to a less extreme aspect ratio.`,
      );
    }
    pipeline = pipeline.resize({ width: w, height: h, fit: "fill" });
    width = w;
    height = h;
    resized = true;
  }

  const jpeg = await pipeline.jpeg({ quality: 90, progressive: false, mozjpeg: false }).toBuffer();
  if (jpeg.length > MAX_IMAGE_BYTES) throw new ImagePrepError("The processed image is over 16 MiB.");
  return { jpeg, width, height, originalFormat, resized };
}
