/** `@liminal/sdk/tui`: what plugins' TUI parts and the TUI renderer import. */
export { defineTui, type SolidKind, TuiHost, type TuiServices } from "./host.ts";

export {
  SlotView,
  type SlotEntry,
  type SlotProps,
  type SlotSource,
  SlotSourceContext,
  useSlotMeta,
} from "./Slot.tsx";

export { ColorContext, useColor } from "./theme.ts";
export * from "./tokens/oklch.ts";
export * from "./tokens/palettes.ts";
export * from "./tokens/ramp.ts";
export * from "./tokens/roles.ts";
export { useBindings } from "@opentui/keymap/solid";
export * from "./ornament/Cells.tsx";
export * from "./ornament/edgeBar.ts";
export * from "./ornament/fade.ts";
export * from "./ornament/glide.ts";
export * from "./ornament/HeaderRule.tsx";
export * from "./ornament/Track.tsx";
export { type Bridge, makeBridge } from "./bridge.ts";
export { type Hint, Hints } from "./Hints.tsx";
export { useMarkdownStyle } from "./markdown.ts";
export { Tail } from "./Tail.tsx";

export {
  type Command,
  type CommandKey,
  type ListedCommand,
  makeTuiCommands,
  type Slash,
  slashCommand,
  TuiCommands,
  type TuiCommandsService,
  type TuiKeymap,
} from "./commands.ts";

export {
  type DialogComponent,
  DialogFrame,
  DialogLayer,
  type DialogProps,
  makeTuiDialogs,
  TuiDialogs,
  type TuiDialogsService,
} from "./dialogs.tsx";

export { SelectDialog, type SelectDialogProps, type SelectOption } from "./SelectDialog.tsx";
export { matchIndices, type MatchRun, matchRuns } from "./match.ts";
