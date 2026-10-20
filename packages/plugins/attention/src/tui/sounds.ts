/** The sounds the user can pick from, each a file in `assets/`. */

import { fileURLToPath } from "node:url";

export interface Sound {
  /** What `settings.json` stores. */
  readonly id: string;
  readonly name: string;
  readonly mood: string;
  /** The absolute path of the audio file. */
  readonly file: string;
}

const assetOf = (name: string) => fileURLToPath(new URL(`../../assets/${name}`, import.meta.url));

// The Lantern, Vesper and Lintel files are by Universfield from Pixabay, under the Pixabay Content
// License.

/** The sound a user who has not picked one gets. */
export const DEFAULT_SOUND: Sound = {
  id: "threshold",
  name: "Threshold",
  mood: "A single soft knock at the door.",
  file: assetOf("threshold.wav"),
};

export const SOUNDS: ReadonlyArray<Sound> = [
  DEFAULT_SOUND,
  {
    id: "lantern",
    name: "Lantern",
    mood: "A small light switched on in a far window.",
    file: assetOf("lantern.wav"),
  },
  {
    id: "vesper",
    name: "Vesper",
    mood: "Evening bells, rung once and left to fade.",
    file: assetOf("vesper.wav"),
  },
  {
    id: "lintel",
    name: "Lintel",
    mood: "A clear tone from above the doorway.",
    file: assetOf("lintel.wav"),
  },
];

/** The sound named `id`; the default one when `id` is unset or names no sound. */
export const soundOf = (id?: string): Sound =>
  SOUNDS.find((sound) => sound.id === id) ?? DEFAULT_SOUND;
