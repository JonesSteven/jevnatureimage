# Nature Lens

Upload a nature photo and [TypeSafe](https://typesafe.ai)'s **Jev** model classifies it:

- **Landscape:** one table, one row per category (lake, mountains, forest, river, waterfall, ocean, desert, meadow, snow/ice, sky), ranked by how likely it is to be visible. Each row shows two judgments side by side:
  - **Visible in photo:** a Noul (yes/no probability) per category, because photos often show several.
  - **Main subject:** one Choice across all categories, plus "other".
- **Person in photo:** a Noul, plus a **Box** (new in Jev 1.14) that draws where the person is.

All 13 questions go in **one** request. The photo is placed once in `state`, so it is sent and billed once.

## Run

```sh
cp .env.example .env          # set TYPESAFE_API_KEY
npm install
npm run dev                   # web on http://localhost:5173, API on :3001
```

Other scripts:

| Script | What it does |
|---|---|
| `npm run probe -- photo.jpg` | Sends one photo and prints the raw and normalized answers (one live request) |
| `npm run build && npm start` | Production: the server serves `dist/` on `:3001` |
| `npm run typecheck` | TypeScript check |

### Docker

```sh
docker compose up --build     # http://localhost:3001
```

The key is read from `.env` at runtime. It is never copied into the image (see `.dockerignore`).

## How it works

```
browser ──multipart──▶ POST /api/classify ──▶ sharp prep ──▶ Jev (systemOne, images header) ──▶ normalized JSON ──▶ UI
```

- `server/imagePrep.ts`: Jev rejects images outside its limits instead of resizing them, so the server normalizes every upload first:
  - Applies the EXIF rotation to the pixels, because the API strips EXIF.
  - Fits each side between 256 and 1568 px. Small images are upscaled, never padded, so Box fractions still line up.
  - Re-encodes as a baseline JPEG.
- `server/questions.ts`: the question set, and the single place the labels are defined.
- `server/jev.ts`: the SDK client sends the `TypeSafe-Danger-Zone-Images: true` header. This module also normalizes answers and maps API errors to friendly messages.
- `web/`: Vite + vanilla TypeScript UI. It shows the exact JPEG sent to Jev, so the person box lines up.

The Box answer always contains a box, even when nobody is in the photo, so the UI draws it only when the person Noul is above 0.5.

> Images and Box are TypeSafe **preview** ("dreamer-ready") features: formats, limits, and accuracy may change.

See [`docs/jev-image-capabilities.md`](docs/jev-image-capabilities.md) for a synopsis of the image models and lessons from building this app.

## Disclaimer

- **Unofficial.** This is an independent demo project. It is not affiliated with, endorsed by, or supported by TypeSafe. "TypeSafe" and "Jev" are TypeSafe's names.
- **Preview features.** It uses TypeSafe's image and Box features, which TypeSafe labels as preview ("dreamer-ready") and not for production. They may change or stop working without notice.
- **Your photos go to a third party.** Every uploaded photo is sent to TypeSafe's API for analysis. Don't upload images you aren't comfortable sharing, and read TypeSafe's terms and privacy policy.
- **Results can be wrong.** Classifications are model guesses. Don't rely on them for anything important, such as safety, identifying people, or legal decisions.
- **Your key, your bill.** You supply your own API key and are responsible for its usage and costs. The server has no authentication or rate limiting, so don't expose it publicly as-is, or anyone could spend your quota.
- **No warranty.** The software is provided "as is", without warranty of any kind. See [LICENSE](LICENSE).

## License

[MIT](LICENSE)
