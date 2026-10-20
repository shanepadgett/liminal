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

export { ColorContext, makeTuiTheme, TuiTheme, type TuiThemeService, useColor } from "./theme.ts";

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
export * from "./ornament/wordmark.ts";
export { type Bridge, makeBridge } from "./bridge.ts";
export { type Hint, Hints } from "./Hints.tsx";
export { READING_WIDTH, useMarkdownStyle } from "./markdown.ts";
export { useMarkdownDiagrams } from "./mermaid.ts";
export { SHIMMER_PERIOD_MS, shimmerColors } from "./shimmer.ts";
export { useClock } from "./clock.ts";
export { formatDuration } from "./duration.ts";
export { formatRelativeDate } from "./relative-date.ts";
export { EllipsizedText } from "./EllipsizedText.tsx";
export { LiveLine } from "./LiveLine.tsx";
export { Vapor } from "./Vapor.tsx";

export {
  thoughtWording,
  type WorkPart,
  WorkWords,
  workColor,
  type WorkWording,
} from "./WorkWords.tsx";

export { ChatHeader, HEADER_ROWS } from "./ChatHeader.tsx";
export { Tail } from "./Tail.tsx";
export { createPin } from "./pin.ts";
export { clampLines, cutLine, wrapText, wrapWords } from "./wrap.ts";

export {
  type Faded,
  fadeAt,
  FRESH_CHARS,
  type Inks,
  inkedOf,
  inkRunsAt,
  markdownOf,
  type Run,
  wordEndAt,
} from "./ink.ts";

export {
  formatShare,
  formatTokens,
  SidebarField,
  SidebarNote,
  SidebarSection,
  SidebarStat,
} from "./SidebarSection.tsx";

export { useCopy } from "./copy.ts";

export {
  type Command,
  type CommandKey,
  enterKeys,
  moveKeys,
  type MovingList,
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

export {
  makeTuiToasts,
  type ToastKind,
  type ToastMessage,
  TuiToasts,
  type TuiToastsService,
} from "./toasts.ts";

export { ListRow } from "./ListRow.tsx";
export { hintsPriority, PROMPT_KEYS_PRIORITY, PromptPriority } from "./prompt.ts";

export {
  type DialogAction,
  type SelectAction,
  SelectDialog,
  type SelectDialogProps,
  type SelectOption,
} from "./SelectDialog.tsx";

export {
  type InputWait,
  makeTuiInputWaits,
  TuiInputWaits,
  type TuiInputWaitsService,
} from "./input-waits.ts";

export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog.tsx";
export { PromptField, type PromptFieldProps } from "./PromptField.tsx";
export { matchIndices, type MatchRun, matchRuns } from "./match.ts";
