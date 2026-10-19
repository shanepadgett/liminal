/**
 * What an `@` can tag, matching what follows it: files, folders, reference repositories, images and
 * skills. Each row has an emoji for its kind, then the path with the matched characters marked and
 * its middle cut to `…` when it does not fit. A short note on the right says what a reference or an
 * image is, as a path alone does not.
 */

import { For, Show } from "solid-js";

import { matchIndices, type RoleColor } from "@liminal/sdk/tui";

import { ListRow } from "./ListRow.tsx";
import { MatchedText } from "./MatchedText.tsx";
import { SuggestionList } from "./SuggestionList.tsx";

type Kind = "file" | "folder" | "reference" | "image" | "skill";

/** Emoji that show as emoji by default, so each is two columns in every terminal. */
const ICONS: Readonly<Record<Kind, string>> = {
  file: "📄",
  folder: "📁",
  reference: "📚",
  image: "🌄",
  skill: "🧩",
};

type Taggable = { readonly kind: Kind; readonly path: string; readonly note?: string };

const TAGGABLES: readonly Taggable[] = [
  { kind: "folder", path: "kernel/src/plugin-host/" },
  { kind: "file", path: "kernel/src/plugin-host/boot.ts" },
  { kind: "file", path: "kernel/src/plugin-host/registry.ts" },
  { kind: "folder", path: "plugins/" },
  { kind: "file", path: "plugins/annex/src/internal/instructions/loadPluginInstructions.ts" },
  { kind: "file", path: "sdk/src/plugin.ts" },
  { kind: "image", path: "docs/images/plugin-host-boot.png", note: "84 KB" },
  { kind: "reference", path: "opencode/packages/plugin/", note: "reference" },
  { kind: "reference", path: "pi/packages/coding-agent/src/core/extensions/", note: "reference" },
  { kind: "skill", path: "skill:plugin-review", note: "skill" },
  { kind: "file", path: "kernel/src/session/SessionStore.ts" },
  { kind: "file", path: "kernel/package.json" },
  { kind: "file", path: "README.md" },
];

/** The icon, two columns wide, and its space. */
const ICON_COLUMNS = 3;

/** The space between the path and its note. */
const NOTE_GAP = 2;

const matching = (typed: string) =>
  TAGGABLES.flatMap((taggable) => {
    const matches = matchIndices(typed, taggable.path);

    return matches === undefined ? [] : [{ taggable, matches }];
  });

export function FileSuggestions(props: {
  readonly color: RoleColor;
  readonly surface: string;
  readonly typed: string;
}) {
  const rows = () => matching(props.typed);

  return (
    <SuggestionList surface={props.surface} count={rows().length}>
      {(columns) => (
        <For each={rows()}>
          {(row, index) => {
            const note = () => row.taggable.note ?? "";
            const noteColumns = () => (note().length === 0 ? 0 : note().length + NOTE_GAP);

            return (
              <ListRow color={props.color} isSelected={index() === 0}>
                <text flexShrink={0}>{`${ICONS[row.taggable.kind]} `}</text>
                <box flexGrow={1} flexShrink={1}>
                  <MatchedText
                    color={props.color}
                    text={row.taggable.path}
                    matches={row.matches}
                    columns={columns() - ICON_COLUMNS - noteColumns()}
                    isSelected={index() === 0}
                  />
                </box>
                <Show when={note().length > 0}>
                  <text flexShrink={0} fg={props.color("text.faint")}>
                    {note()}
                  </text>
                </Show>
              </ListRow>
            );
          }}
        </For>
      )}
    </SuggestionList>
  );
}
