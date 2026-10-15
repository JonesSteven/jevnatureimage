import { box, choice, noul, type Questions } from "@typesafe-ai/sdk";

// One source of truth for the landscape labels: each feature becomes an option of the
// primary-scene Choice and its own Noul, because several features often appear together.
export const FEATURES = [
  { id: "lake", label: "Lake / pond", description: "A body of still fresh water such as a lake, pond, tarn or reservoir" },
  { id: "mountains", label: "Mountains", description: "Mountains, peaks, ridgelines or steep rocky hills" },
  { id: "forest", label: "Forest", description: "A forest, woodland or dense stand of trees" },
  { id: "river", label: "River / stream", description: "Flowing fresh water such as a river, creek or stream" },
  { id: "waterfall", label: "Waterfall", description: "Water falling over a drop such as a waterfall or cascade" },
  { id: "ocean", label: "Ocean / coast", description: "The sea, ocean, a beach, sea cliffs or a shoreline with waves" },
  { id: "desert", label: "Desert", description: "Arid land such as sand dunes, desert scrub, canyons or bare red rock" },
  { id: "meadow", label: "Meadow / grassland", description: "Open grassland, a meadow, prairie or a field of wildflowers" },
  { id: "snow", label: "Snow / ice", description: "Snow cover, glaciers, icefields or frozen water" },
  { id: "sky", label: "Dramatic sky", description: "A sky that is a main subject: sunset, sunrise, aurora, storm clouds or stars" },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

export const SCENE_OTHER = { id: "other", label: "Other", description: "None of the listed landscape features dominates the photo" };

const primaryCriteria = Object.fromEntries(
  [...FEATURES, SCENE_OTHER].map((f) => [f.id, `${f.label}: ${f.description}`]),
);

export const featureQuestionId = (id: FeatureId) => `has_${id}` as const;

// All questions share the one image in `state.photo`, so it is sent and billed once.
export function buildQuestions(): Questions {
  const questions: Questions = {
    primary_scene: choice(
      "Which landscape feature is the main subject of the nature photo in `photo`?",
      primaryCriteria,
    ),
    person_present: noul("Is there a person visible anywhere in `photo`?", {
      true: "At least one human is visible, however small or distant, including silhouettes, partial bodies or people in boats",
      false: "No humans are visible; animals, statues, buildings, tents or vehicles alone do not count",
    }),
    // Speculative: Box always returns a box, so the client only shows it when person_present is high.
    person_box: box("the most prominent person in `photo`"),
  };
  for (const f of FEATURES) {
    questions[featureQuestionId(f.id)] = noul(`Is there a visible ${f.label.toLowerCase()} anywhere in \`photo\`?`, {
      true: `${f.description} is visible in the photo, even if it is not the main subject`,
      false: `No ${f.label.toLowerCase()} is visible in the photo`,
    });
  }
  return questions;
}
