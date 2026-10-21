/** Chat's server: reads the `chat` settings section for the TUI, which cannot read settings itself. */

import { Effect } from "effect";

import { Settings } from "@liminal/settings/contract";

import { ChatRpcs, ChatSettings } from "./contract.ts";

export const layer = ChatRpcs.toLayer(
  Effect.gen(function* () {
    const settings = yield* Settings;

    const debug = settings.section("chat", ChatSettings).pipe(
      Effect.map((section) => section.debug),
      Effect.catchTag("SettingsInvalid", (error) =>
        Effect.as(Effect.logWarning(`chat settings ignored: ${error.message}`), false),
      ),
    );

    return ChatRpcs.of({ "chat/debug": () => debug });
  }),
);
