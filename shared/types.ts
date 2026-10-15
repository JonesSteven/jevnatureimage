// The JSON contract between the server (/api/classify) and the web client.

// One row per landscape category, combining two independent judgments on the same photo.
export interface SceneRow {
  id: string;
  label: string;
  detected: number | null; // Noul: is it visible anywhere? (null for "other", which has no Noul)
  primary: number; // Choice probability that it is the main subject
}

export interface Landscape {
  primary: string; // the chosen main-subject category id
  primaryLabel: string;
  confidence: number;
  rows: SceneRow[]; // ranked by `detected`, highest first; "other" last
}

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ClassifyResult {
  preview: string; // data URL of the exact JPEG sent to Jev, so box fractions line up
  image: { width: number; height: number; originalFormat: string; resized: boolean };
  landscape: Landscape;
  person: {
    p: number; // Noul probability that a person is visible
    present: boolean;
    box: Box | null; // only when present; Box always answers, so it is gated on the Noul
    boxConfidence: number | null;
  };
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
  elapsedMs: number;
}

export interface ApiError {
  error: string;
  detail?: string;
  requestId?: string;
}
