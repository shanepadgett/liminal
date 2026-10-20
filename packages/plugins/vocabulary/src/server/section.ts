/** The `vocabulary/terms` prompt section: every term's name, so the model keeps to them. */

import { Effect } from "effect";

import {
  definePromptSection,
  Lines,
  linesRender,
  type SectionRead,
} from "@liminal/context/contract";
import { type Notice, type ProblemNotices } from "@liminal/notices/contract";

import type { Store } from "./store.ts";

/** After the instruction files, before skills. */
const SECTION_ORDER = 230;

const unreadable = (message: string): Notice => ({
  kind: "warning",
  title: "Couldn't read the vocabulary",
  body: message,
});

export const termsSection = (store: Store, tell: ProblemNotices) =>
  definePromptSection<Lines>({
    key: "vocabulary/terms",
    order: SECTION_ORDER,
    codec: Lines,
    read: ({ sessionId }) =>
      store.read.pipe(
        Effect.map((terms): SectionRead<Lines> =>
          terms.length === 0
            ? { type: "removed" }
            : { type: "present", value: terms.map(({ term }) => term) },
        ),
        Effect.catchTag("VocabularyError", (error) =>
          Effect.as(tell(sessionId, [unreadable(error.message)]), { type: "unavailable" as const }),
        ),
      ),
    render: linesRender({
      initial:
        "Vocabulary: the project's agreed terms. Use these names exactly; read a definition with the vocabulary tool.",
      added: "New vocabulary terms:",
      removed: "Vocabulary terms no longer used:",
    }),
  });
