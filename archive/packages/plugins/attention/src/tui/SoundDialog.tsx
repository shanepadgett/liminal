/**
 * The menu of notification sounds; the highlighted one plays as the highlight moves, and again on
 * ctrl+y.
 */

import { type DialogProps, SelectDialog } from "@liminal/sdk/tui";

import { SOUNDS } from "./sounds.ts";

const options = SOUNDS.map((sound) => ({
  title: sound.name,
  value: sound.id,
  description: sound.mood,
}));

/** Plays the highlighted sound again, for hearing it twice without moving. */
const PLAY_KEY = "ctrl+y";

export interface SoundDialogProps extends DialogProps {
  /** The id of the saved sound, highlighted as the menu opens. */
  readonly current: string;
  /** Plays the sound `id` as a preview. */
  readonly preview: (id: string) => void;
  /** Runs with the id the user picked. */
  readonly pick: (id: string) => void;
}

export function SoundDialog(props: SoundDialogProps) {
  // The menu highlights the saved sound as it opens, which should not play it.
  let isOpening = true;

  return (
    <SelectDialog
      title="Notification sound"
      options={options}
      current={props.current}
      close={props.close}
      onHighlight={(id) => {
        if (isOpening) {
          isOpening = false;

          return;
        }

        props.preview(id);
      }}
      onSelect={props.pick}
      actions={[{ key: PLAY_KEY, label: "play", keepsOpen: true, run: props.preview }]}
    />
  );
}
