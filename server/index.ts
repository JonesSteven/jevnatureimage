import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { ImagePrepError, prepareImage } from "./imagePrep.ts";
import { askJev, describeJevError, hasApiKey, JEV_MODEL, normalize } from "./jev.ts";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_UPLOAD_MB = 25;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: JEV_MODEL, apiKeyConfigured: hasApiKey() });
});

app.post("/api/classify", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No photo uploaded (expected form field 'photo')." });
  if (!hasApiKey()) return res.status(500).json({ error: "TYPESAFE_API_KEY is not set on the server." });

  let img;
  try {
    img = await prepareImage(req.file.buffer);
  } catch (err) {
    if (err instanceof ImagePrepError) return res.status(415).json({ error: err.message });
    throw err;
  }

  try {
    const { res: jev, elapsedMs } = await askJev(img);
    res.json(normalize(jev.answers, img, { model: jev.model, usage: jev.usage, elapsedMs }));
  } catch (err) {
    const { status, body } = describeJevError(err);
    console.error(`[classify] ${status} ${body.error}`, body.requestId ?? "", body.detail ?? "");
    res.status(status).json(body);
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? `Photo is larger than ${MAX_UPLOAD_MB} MB.` : err.message;
    return res.status(413).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`jevnatureimage API on http://localhost:${PORT} (model ${JEV_MODEL}, key ${hasApiKey() ? "set" : "MISSING"})`);
});
