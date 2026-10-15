import type { ApiError, ClassifyResult, SceneRow } from "../shared/types.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const drop = $<HTMLLabelElement>("drop");
const fileInput = $<HTMLInputElement>("file");
const errorBox = $("error");
const results = $("results");
const preview = $<HTMLImageElement>("preview");
const boxEl = $("box");
const busy = $("busy");

const DETECTED_THRESHOLD = 0.5;
const pct = (p: number) => `${Math.round(p * 100)}%`;

function bar(kind: "detected" | "primary", p: number | null) {
  const cell = document.createElement("span");
  cell.className = `cell ${kind}`;
  if (p == null) {
    cell.innerHTML = `<span class="na">—</span>`;
    return cell;
  }
  cell.innerHTML = `<span class="track"><span class="fill"></span></span><span class="val"></span>`;
  cell.querySelector<HTMLElement>(".fill")!.style.width = pct(p);
  cell.querySelector<HTMLElement>(".val")!.textContent = pct(p);
  return cell;
}

function sceneRow(r: SceneRow, primaryId: string) {
  const row = document.createElement("div");
  row.className = "scene-row";
  row.setAttribute("role", "row");
  if (r.detected != null && r.detected > DETECTED_THRESHOLD) row.classList.add("on");
  if (r.id === primaryId) row.classList.add("main");
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = r.label;
  row.append(name, bar("detected", r.detected), bar("primary", r.primary));
  return row;
}

function render(r: ClassifyResult) {
  preview.src = r.preview;

  const l = r.landscape;
  $("primary-label").textContent = l.primaryLabel;
  $("primary-conf").textContent = `${pct(l.confidence)} confidence`;
  $("scene-rows").replaceChildren(...l.rows.map((row) => sceneRow(row, l.primary)));

  $("person-label").textContent = r.person.present ? "Yes" : "No";
  $("person-conf").textContent = `${pct(r.person.p)} likely`;
  $("person-fill").style.width = pct(r.person.p);
  $("person-fill").classList.toggle("on", r.person.present);
  if (r.person.box) {
    const b = r.person.box;
    Object.assign(boxEl.style, {
      left: pct(b.left),
      top: pct(b.top),
      width: pct(b.right - b.left),
      height: pct(b.bottom - b.top),
    });
    $("box-label").textContent = r.person.boxConfidence == null ? "person" : `person · ${pct(r.person.boxConfidence)}`;
    boxEl.hidden = false;
    $("person-note").textContent = "Outlined on the photo using Jev 1.14's Box question.";
  } else {
    boxEl.hidden = true;
    $("person-note").textContent = "No outline is drawn when no one is detected (Box always returns a box, so it's gated on this yes/no).";
  }

  const resized = r.image.resized ? ", resized" : "";
  $("caption").textContent = `${r.image.originalFormat.toUpperCase()} → JPEG ${r.image.width}×${r.image.height}${resized}`;
  const tokens = r.usage.inputTokens == null ? "" : ` · ${r.usage.inputTokens.toLocaleString()} in / ${r.usage.outputTokens ?? "?"} out tokens`;
  $("meta").textContent = `${r.model} · ${(r.elapsedMs / 1000).toFixed(1)}s${tokens}`;
}

function showError(msg: string | null) {
  errorBox.textContent = msg ?? "";
  errorBox.hidden = !msg;
}

async function classify(file: File) {
  showError(null);
  results.hidden = false;
  boxEl.hidden = true;
  busy.hidden = false;
  drop.classList.add("compact");
  preview.src = URL.createObjectURL(file); // browser preview until the processed JPEG returns

  const body = new FormData();
  body.append("photo", file);
  try {
    const res = await fetch("/api/classify", { method: "POST", body });
    const json = (await res.json().catch(() => ({ error: `Server returned ${res.status}` }))) as ClassifyResult | ApiError;
    if (!res.ok || "error" in json) {
      const e = json as ApiError;
      showError([e.error, e.requestId && `(request ${e.requestId})`].filter(Boolean).join(" "));
      results.classList.add("empty");
      return;
    }
    results.classList.remove("empty");
    render(json);
  } catch (err) {
    showError(`Couldn't reach the server: ${(err as Error).message}`);
  } finally {
    busy.hidden = true;
  }
}

function take(files: FileList | null | undefined) {
  const f = files?.[0];
  if (f) void classify(f);
}

fileInput.addEventListener("change", () => take(fileInput.files));
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") (e.preventDefault(), fileInput.click());
});
for (const t of ["dragenter", "dragover"]) {
  drop.addEventListener(t, (e) => (e.preventDefault(), drop.classList.add("over")));
}
for (const t of ["dragleave", "drop"]) {
  drop.addEventListener(t, (e) => (e.preventDefault(), drop.classList.remove("over")));
}
drop.addEventListener("drop", (e) => take((e as DragEvent).dataTransfer?.files));
