# TypeSafe image models: synopsis and lessons

Sources:
- [docs.typesafe.ai/images](https://docs.typesafe.ai/images)
- [docs.typesafe.ai/primitives/box](https://docs.typesafe.ai/primitives/box)
- [Jev 1.14 release post](https://typesafe.ai/blog/jev-1-14)

Researched 2026-10-15.

## Synopsis

Images and Box are **preview ("dreamer-ready")** features and are not meant for production yet. Request formats, limits, and accuracy may change.

- **Turn it on:** send `TypeSafe-Danger-Zone-Images: true` on every request that has an image or a Box question.
  - Images work on `jev-1.13.0` and `jev-1.14.0`. Box needs **1.14**.
  - JS SDK: `new TypeSafeClient({ defaultHeaders: { "TypeSafe-Danger-Zone-Images": "true" } })`.
- **How images are sent:**
  - A top-level `assets` map holds images, each keyed by a reference string (use UUIDs).
  - You put the reference string wherever the image belongs: in **`state`** (shared by all questions, so the cheapest), in a question's **`instructions`**, or in **`criteria`**. In criteria, an image can define what an option *looks like*, for example "same place as this reference photo".
  - The SDKs handle the references for you: `image(bytes)` in JS, an `Image` asset in Python.
  - Over HTTP, multipart is the recommended upload method. Base64 inside JSON costs about a third more toward the 32 MiB body limit.
- **Every primitive accepts images:** Choice, Noul, and Score. **Box** is the new primitive that locates something in an image.
- **Box:**
  - Returns `{top, bottom, left, right}` as 0–1 fractions of the image height and width, plus `confidence`.
  - It **always returns a box** and has no "not found" answer, so pair it with a Noul for presence.
  - One target per question.
  - For small targets, crop to a region first, then run Box on the crop and map the result back.
- **Hard limits:**
  - PNG or JPEG still images only.
  - Each image at most 16 MiB.
  - Each side 256–1568 px, and 78,400–2,458,624 px in total.
  - Requests at most 32 MiB.
  - Images outside the limits are **rejected, not resized**. One bad image fails the whole request.
  - The API strips EXIF and does not apply orientation, so rotate the pixels yourself first.
- **Cost:** image tokens are billed as ordinary input tokens, and there are no separate image rate limits. In this app, one photo plus 14 questions comes to about 4k input tokens.
- **Guidance:** models do worse on images than on text, so break the work into simple, narrow questions.

### New in Jev 1.14 (`jev-1.14.0`, alias `jev-preview`; `jev-latest` moves to it about a week after release)
- Small improvements across the board, with the biggest gains in multilingual tasks.
- The **Box** question type, available on 1.14 only.
- The **images** header, opening up the multimodal support that 1.13 already had.
- **Long context:** `TypeSafe-Danger-Zone-Long-Context: true` allows requests beyond the production context limit.
- Opt-in query sharing to help TypeSafe find model weaknesses. TypeSafe says it won't train on these queries.
- 1.13 stays available for now. TypeSafe promises 60 days' notice before deprecating 1.13, and 30 days' notice for 1.14.

## Lessons from building this app
- One request carries 13 questions (Choice + 11 Nouls + Box) over one image in `state`. Answers came back in about 0.2–0.3 s and used about 4k input tokens.
- Multi-label Nouls catch secondary features that a single Choice hides. For example, a glacier tarn came back as snow 0.99, lake 0.97, and mountains 0.97, while the primary-scene Choice picked "snow".
- Season detection was removed because it was unreliable: summer alpine shots with lingering snow were labelled winter. If you bring it back, try per-cue Nouls (for example "autumn-coloured leaves visible?" or "bare deciduous trees?") and combine them in code instead of asking for the season directly.
- In a test, the person Box tightly framed the person, with confidence about 0.9. When nobody is in the photo, Box still returns a box, but with very low confidence (about 0.04), which is why the app gates it on the Noul.
