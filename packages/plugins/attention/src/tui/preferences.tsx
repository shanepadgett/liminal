/**
 * The user's choices about the sound, read from the settings: whether it plays and which one. The
 * palette's Notifications section changes them and saves each change to the global settings.
 */

import type { CliRenderer } from "@opentui/core";
import { Effect, Option } from "effect";
import { createSignal } from "solid-js";

import {
  type DialogProps,
  makeBridge,
  TuiCommands,
  TuiDialogs,
  TuiHost,
  TuiToasts,
  type TuiToastsService,
} from "@liminal/sdk/tui";

import { AttentionRpcs, type AttentionSettings } from "../contract.ts";
import type { Chime } from "./chimes.ts";
import { notifyWith } from "./notifications.ts";
import { playWith } from "./sound.ts";
import { SoundDialog } from "./SoundDialog.tsx";
import { soundOf } from "./sounds.ts";

const CATEGORY = "Notifications";

/** A settings file that cannot be read leaves the sound on with the default sound. */
const defaultsIfUnreadable = <E extends { readonly message: string }>(
  read: Effect.Effect<AttentionSettings, E>,
) =>
  read.pipe(
    Effect.tapError((error) => Effect.logWarning(`attention settings ignored: ${error.message}`)),
    Effect.orElseSucceed((): AttentionSettings => ({})),
  );

/** Tells the user a choice took effect for now but was not saved. */
const unsaved = (toasts: TuiToastsService) => (error: { readonly message: string }) =>
  Effect.sync(() => {
    toasts.show({ kind: "error", title: "Notification setting not saved", message: error.message });
  });

const setUpSoundCommand = Effect.fn("setUpSoundCommand")(function* (
  current: () => string,
  preview: (id: string) => void,
  pick: (id: string) => void,
) {
  const dialogs = yield* TuiDialogs;
  const commands = yield* TuiCommands;

  yield* commands.register([
    {
      name: "attention.sound",
      title: "Notification sound",
      desc: "Pick which sound plays",
      category: CATEGORY,
      palette: true,
      run: () => {
        dialogs.show((props: DialogProps) => (
          <SoundDialog close={props.close} current={current()} preview={preview} pick={pick} />
        ));
      },
    },
  ]);
});

/** Loads saved choices; sound selection is available only with a sound player. */
export const setUpPreferences = Effect.fn("setUpPreferences")(function* (
  player: Option.Option<string>,
) {
  const host = yield* TuiHost;
  const toasts = yield* TuiToasts;
  const commands = yield* TuiCommands;
  const bridge = yield* makeBridge;
  const client = yield* host.client(AttentionRpcs);

  const saved = yield* defaultsIfUnreadable(client["attention/get"]());

  const [isEnabled, setEnabled] = createSignal(saved.enabled ?? true);
  const [soundId, setSoundId] = createSignal(soundOf(saved.sound).id);

  const toggle = () => {
    const enabled = setEnabled(!isEnabled());
    toasts.show({ kind: "info", title: enabled ? "Notifications on" : "Notifications off" });

    bridge.run(
      client["attention/set-enabled"]({ enabled }).pipe(
        Effect.catchTag("AttentionError", unsaved(toasts)),
      ),
    );
  };

  const play = (id: string) =>
    Option.match(player, {
      onNone: () => Effect.void,
      onSome: (command) => playWith(command, soundOf(id)),
    });

  if (Option.isSome(player)) {
    yield* setUpSoundCommand(
      soundId,
      (id) => {
        bridge.run(play(id));
      },
      (id) => {
        setSoundId(id);

        bridge.run(
          client["attention/set-sound"]({ sound: id }).pipe(
            Effect.catchTag("AttentionError", unsaved(toasts)),
          ),
        );
      },
    );
  }

  yield* commands.register([
    {
      name: "attention.toggle",
      title: "Toggle notifications",
      desc: "Turn terminal notifications and sound on or off",
      category: CATEGORY,
      palette: true,
      run: toggle,
    },
  ]);

  return {
    notify: (renderer: Pick<CliRenderer, "triggerNotification">, chime: Chime) =>
      Effect.suspend(() => notifyWith(renderer, chime, isEnabled(), play(soundId()))),
  };
});
