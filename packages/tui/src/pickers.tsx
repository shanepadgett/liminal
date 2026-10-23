/**
 * Pickers as data: a command gives its rows and what a pick does, and the kit's `Picker` draws them
 * in a dialog. Every spec passes through the `Pickers` pipeline before it opens, so a plugin can
 * wrap a picker by its name to reorder or regroup its rows or add keys.
 */
import { Effect } from "effect";

import { Pipeline } from "@shanepadgett/liminal-core";

import { Dialogs } from "./dialogs.tsx";
import { Picker, type PickerProps } from "./kit/Picker.tsx";

export interface PickerSpec extends PickerProps {
  /** What a wrap matches on, such as `stash/stashes`. */
  readonly name: string;
}

/** Every picker's spec passes through it before it opens; the terminal returns it as is. */
export class Pickers extends Pipeline.Service<Pickers, PickerSpec, PickerSpec>()("tui/Pickers") {}

export const makePickers = Pipeline.make((spec: PickerSpec) => Effect.succeed(spec));

/** Opens `spec`'s picker over the screen, after every wrap of it. */
export const openPicker = Effect.fn("openPicker")(function* (spec: PickerSpec) {
  const pickers = yield* Pickers;
  const dialogs = yield* Dialogs;
  const wrapped = yield* pickers.run(spec);

  dialogs.open((close) => <Picker {...wrapped} close={close} />);
});
