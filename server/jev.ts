import { APIConnectionError, APIError, image, TypeSafeClient } from "@typesafe-ai/sdk";
import type { ApiError, ClassifyResult, Landscape, SceneRow } from "../shared/types.ts";
import type { PreparedImage } from "./imagePrep.ts";
import { buildQuestions, FEATURES, featureQuestionId, SCENE_OTHER } from "./questions.ts";

export const JEV_MODEL = process.env.JEV_MODEL || "jev-1.14.0"; // Box needs Jev 1.14
const PERSON_THRESHOLD = 0.5;

let client: TypeSafeClient | undefined;
function getClient() {
  // Lazily created so the server can start (and report health) without a key.
  client ??= new TypeSafeClient({
    defaultModel: JEV_MODEL,
    timeout: 60_000, // per attempt; image requests with many questions take longer than text
    defaultHeaders: { "TypeSafe-Danger-Zone-Images": "true" }, // images + Box are opt-in previews
  });
  return client;
}

export function hasApiKey() {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

export async function askJev(img: PreparedImage) {
  const t0 = Date.now();
  const res = await getClient().systemOne({
    model: JEV_MODEL,
    state: { photo: image(img.jpeg) },
    questions: buildQuestions(),
  });
  return { res, elapsedMs: Date.now() - t0 };
}

// Defensive normalization: never trust that every answer arrived with the expected type.
export function normalize(
  answers: Record<string, any>,
  img: PreparedImage,
  meta: { model: string; usage: { input_tokens: number | null; output_tokens: number | null }; elapsedMs: number },
): ClassifyResult {
  const pick = (id: string, type: string) => (answers[id]?.type === type ? answers[id] : undefined);

  // Merge the per-feature Nouls with the primary-scene Choice so each category is listed once.
  const primaryAnswer = pick("primary_scene", "choice");
  const primaryP = (id: string) => Number(primaryAnswer?.probabilities?.[id] ?? 0);
  const rows: SceneRow[] = FEATURES.map((f) => ({
    id: f.id,
    label: f.label,
    detected: Number(pick(featureQuestionId(f.id), "noul")?.noul ?? 0),
    primary: primaryP(f.id),
  })).sort((a, b) => b.detected! - a.detected! || b.primary - a.primary);
  rows.push({ id: SCENE_OTHER.id, label: SCENE_OTHER.label, detected: null, primary: primaryP(SCENE_OTHER.id) });
  const primaryId: string = primaryAnswer?.choice ?? [...rows].sort((a, b) => b.primary - a.primary)[0]!.id;
  const landscape: Landscape = {
    primary: primaryId,
    primaryLabel: rows.find((r) => r.id === primaryId)?.label ?? primaryId,
    confidence: Number(primaryAnswer?.confidence ?? 0),
    rows,
  };

  const personP = Number(pick("person_present", "noul")?.noul ?? 0);
  const present = personP > PERSON_THRESHOLD;
  const boxAnswer = pick("person_box", "box");

  return {
    preview: `data:image/jpeg;base64,${img.jpeg.toString("base64")}`,
    image: { width: img.width, height: img.height, originalFormat: img.originalFormat, resized: img.resized },
    landscape,
    person: {
      p: personP,
      present,
      box: present && boxAnswer ? { ...boxAnswer.box } : null,
      boxConfidence: present && boxAnswer ? (boxAnswer.confidence ?? null) : null,
    },
    model: meta.model,
    usage: { inputTokens: meta.usage.input_tokens, outputTokens: meta.usage.output_tokens },
    elapsedMs: meta.elapsedMs,
  };
}

export function describeJevError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof APIError) {
    const detail = typeof err.body === "string" ? err.body : JSON.stringify(err.body);
    const messages: Record<number, string> = {
      400: "Jev rejected the request (bad image, unsupported model, or the images header is missing).",
      401: "The TypeSafe API key was rejected. Check TYPESAFE_API_KEY.",
      403: "This API key doesn't have access to that model or feature.",
      413: "The image is too large for Jev.",
      429: "Rate limited by TypeSafe. Wait a moment and try again.",
    };
    return {
      // Upstream auth and server failures are a bad gateway from the browser's point of view.
      status: err.status >= 500 || err.status === 401 || err.status === 403 ? 502 : err.status,
      body: {
        error: messages[err.status] ?? `TypeSafe API error (${err.status}).`,
        detail: detail?.slice(0, 500),
        requestId: err.requestId,
      },
    };
  }
  if (err instanceof APIConnectionError) {
    return { status: 504, body: { error: "Couldn't reach TypeSafe (network error or timeout).", detail: err.message } };
  }
  return { status: 500, body: { error: "Unexpected server error.", detail: err instanceof Error ? err.message : String(err) } };
}
