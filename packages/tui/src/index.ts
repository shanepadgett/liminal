/** Liminal's terminal UI: the runtime plugins' `tui` entries draw in, and the UI kit they draw with. */
export { Renderer } from "./base.ts";

export {
  type EntryRun,
  type Fork,
  makeEntryRun,
  type Services,
  useRun,
  useSessionView,
  useWatch,
} from "./bridge.ts";

export {
  activeHints,
  type Command,
  type CommandHint,
  type CommandKey,
  commandLayer,
  Keymap,
  keymapCommand,
  listCommands,
  type ListedCommand,
  registerCommands,
  type Slash,
  slashCommands,
} from "./commands.ts";

export { Colors, type Mix, type RoleColor, useColor, useMix, useSyntax } from "./colors.ts";
export { Dialogs, type DialogView } from "./dialogs.tsx";
export * as kit from "./kit/index.ts";
export { openPicker, type PickerSpec, Pickers } from "./pickers.tsx";
export { EntryInvalid, run } from "./run.ts";
export { defineSlot, screen, type SlotHandle, Slots, SlotView } from "./slots.tsx";
