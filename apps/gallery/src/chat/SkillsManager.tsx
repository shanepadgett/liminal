/** Skill management designs. All paths and deletion outcomes are sample data. */

import { For, Show } from "solid-js";

import { EllipsizedText, type RoleColor } from "@liminal/sdk/tui";

import { withRoles } from "../entryViews.ts";
import type { EntryState } from "../shell/entries.ts";
import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";
import { Section } from "./Section.tsx";

type SkillLocation =
  | { readonly kind: "folder" }
  | { readonly kind: "symlink"; readonly target: string }
  | { readonly kind: "missing"; readonly target: string };

type ManagedSkill = {
  readonly name: string;
  readonly folder: string;
  readonly description: string;
  readonly location: SkillLocation;
};

const LOCAL: ManagedSkill = {
  name: "review",
  folder: ".agents/skills",
  description:
    "Review changes for bugs, missing tests, regressions, and inconsistencies with project conventions.",
  location: { kind: "folder" },
};

const LINKED: ManagedSkill = {
  name: "show-me",
  folder: "~/.agents/skills",
  description:
    "Explain a topic with diagrams and visual examples, including code sketches and focused visual artifacts.",
  location: { kind: "symlink", target: "~/dev/agent-skills/show-me" },
};

const MISSING: ManagedSkill = {
  name: "old-deploy",
  folder: ".agents/skills",
  description: "Unavailable: the symlink target is missing.",
  location: { kind: "missing", target: "~/dev/agent-skills/old-deploy" },
};

const SKILLS: readonly ManagedSkill[] = [
  {
    name: "agent-browser",
    folder: "~/.agents/skills",
    description: "Automate browser tasks.",
    location: { kind: "folder" },
  },
  LINKED,
  {
    name: "release",
    folder: "~/.liminal/skills",
    description: "Prepare a release.",
    location: { kind: "folder" },
  },
  {
    name: "review",
    folder: "../.agents/skills",
    description: "Review changes using repository conventions.",
    location: { kind: "folder" },
  },
  {
    name: "commit",
    folder: ".liminal/skills",
    description: "Prepare a project commit.",
    location: { kind: "folder" },
  },
  LOCAL,
  MISSING,
];

const FOLDERS = [
  "~/.agents/skills",
  "~/.liminal/skills",
  "../.agents/skills",
  ".agents/skills",
  ".liminal/skills",
];

function locationLabel(location: SkillLocation): string {
  const labels = { folder: "", symlink: "Symlink", missing: "Symlink · target missing" };

  return labels[location.kind];
}

function SkillTarget(props: { readonly color: RoleColor; readonly skill: ManagedSkill }) {
  const location = () => props.skill.location;

  return (
    <box flexDirection="column">
      <Show when={location().kind !== "folder"}>
        <text fg={props.color(location().kind === "missing" ? "feedback.warning" : "text.muted")}>
          {(() => {
            const link = location();

            return link.kind === "folder" ? "" : `→ ${link.target}`;
          })()}
        </text>
      </Show>
    </box>
  );
}

function SkillRow(props: {
  readonly color: RoleColor;
  readonly skill: ManagedSkill;
  readonly isSelected: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <text flexShrink={0} fg={props.color(props.isSelected ? "text.base" : "text.muted")}>
        {props.skill.name}
      </text>
      <EllipsizedText
        text={props.skill.description.replace(/\s+/g, " ")}
        fg={props.color(props.isSelected ? "text.muted" : "text.faint")}
      />
      <text
        flexShrink={0}
        fg={props.color(
          props.skill.location.kind === "missing" ? "feedback.warning" : "text.faint",
        )}
      >
        {locationLabel(props.skill.location)}
      </text>
    </ListRow>
  );
}

function SkillsManager(props: {
  readonly color: RoleColor;
  readonly selected: ManagedSkill;
  readonly isEmpty?: boolean;
  readonly error?: string;
}) {
  return (
    <Dialog
      color={props.color}
      title="Manage skills"
      width={90}
      hints={
        props.isEmpty
          ? []
          : [
              ["↑↓", "choose"],
              ["ctrl+x", "delete"],
              ["ctrl+r", "refresh"],
            ]
      }
    >
      <text fg={props.color("text.ghost")}>› Filter skills</text>
      <scrollbox height={16} flexShrink={1} minHeight={0} scrollbarOptions={{ visible: false }}>
        <box flexDirection="column" gap={1}>
          <For each={FOLDERS}>
            {(folder) => (
              <box flexDirection="column">
                <Section color={props.color} title={folder} />
                <Show
                  when={!props.isEmpty}
                  fallback={<text fg={props.color("text.faint")}> No skills in this folder.</text>}
                >
                  <For each={SKILLS.filter((skill) => skill.folder === folder)}>
                    {(skill) => (
                      <SkillRow
                        color={props.color}
                        skill={skill}
                        isSelected={skill === props.selected}
                      />
                    )}
                  </For>
                </Show>
              </box>
            )}
          </For>
        </box>
      </scrollbox>
      <Show when={!props.isEmpty}>
        <SkillTarget color={props.color} skill={props.selected} />
      </Show>
      <Show when={props.error}>
        {(error) => <text fg={props.color("feedback.danger")}>{error()}</text>}
      </Show>
    </Dialog>
  );
}

const DELETE_WARNINGS = {
  folder: "Permanently delete this skill folder and every file inside it. This cannot be undone.",
  missing: "Delete this symlink. Its target is already missing.",
  symlink:
    "Delete symlink only keeps the target. Deleting the target permanently deletes its folder and every file inside it. This cannot be undone.",
};

function DeleteSkill(props: { readonly color: RoleColor; readonly skill: ManagedSkill }) {
  const isFolder = () => props.skill.location.kind === "folder";

  return (
    <Dialog
      color={props.color}
      title={isFolder() ? "Delete skill?" : "Delete symlink?"}
      width={76}
      hints={[
        ["↑↓", "choose"],
        ["enter", "confirm"],
        ["esc", "cancel"],
      ]}
    >
      <text fg={props.color("text.muted")}>{`${props.skill.folder}/${props.skill.name}`}</text>
      <text fg={props.color("text.base")}>{props.skill.description}</text>
      <SkillTarget color={props.color} skill={props.skill} />
      <text fg={props.color(isFolder() ? "feedback.warning" : "text.base")}>
        {DELETE_WARNINGS[props.skill.location.kind]}
      </text>
      <Show when={props.skill.folder.startsWith("~")}>
        <text fg={props.color("feedback.warning")}>
          This is a global skill. Removing it affects every project that uses this path.
        </text>
      </Show>
      <box flexDirection="column">
        <ListRow color={props.color} isSelected>
          <text fg={props.color("text.base")}>Cancel</text>
        </ListRow>
        <ListRow color={props.color} isSelected={false}>
          <text fg={props.color("feedback.danger")}>
            {isFolder() ? "Delete skill folder" : "Delete symlink only"}
          </text>
        </ListRow>
        <Show when={props.skill.location.kind === "symlink"}>
          <ListRow color={props.color} isSelected={false}>
            <text fg={props.color("feedback.danger")}>Delete symlink and target</text>
          </ListRow>
        </Show>
      </box>
    </Dialog>
  );
}

export const SKILLS_STATES: readonly [EntryState, ...EntryState[]] = [
  {
    name: "Project folder",
    fill: "screen",
    view: withRoles((color) => <SkillsManager color={color} selected={LOCAL} />),
  },
  {
    name: "Global symlink",
    fill: "screen",
    view: withRoles((color) => <SkillsManager color={color} selected={LINKED} />),
  },
  {
    name: "Missing symlink target",
    fill: "screen",
    view: withRoles((color) => <SkillsManager color={color} selected={MISSING} />),
  },
  {
    name: "Delete folder",
    fill: "screen",
    view: withRoles((color) => <DeleteSkill color={color} skill={LOCAL} />),
  },
  {
    name: "Remove global symlink",
    fill: "screen",
    view: withRoles((color) => <DeleteSkill color={color} skill={LINKED} />),
  },
  {
    name: "Remove broken symlink",
    fill: "screen",
    view: withRoles((color) => <DeleteSkill color={color} skill={MISSING} />),
  },
  {
    name: "No skills",
    fill: "screen",
    view: withRoles((color) => <SkillsManager color={color} selected={LOCAL} isEmpty />),
  },
  {
    name: "Delete failed",
    fill: "screen",
    view: withRoles((color) => (
      <SkillsManager
        color={color}
        selected={LOCAL}
        error="Could not delete .agents/skills/review: permission denied. Check the folder permissions and try again."
      />
    )),
  },
];
