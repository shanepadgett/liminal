/** Management keeps its filter and physical selection while confirmation replaces the dialog. */

import { Effect } from "effect";
import type { RpcClient, RpcClientError, RpcGroup } from "effect/rpc";
import { createSignal, For, Show } from "solid-js";

import {
  type Bridge,
  type DialogProps,
  matchIndices,
  SelectDialog,
  type TuiDialogsService,
  useColor,
} from "@liminal/sdk/tui";

import type { DeleteSkillRequest, ManagedSkill, SkillFolder, SkillsRpcs } from "../contract.ts";
import { DeleteSkillDialog } from "./DeleteSkillDialog.tsx";
import { locationLabel, SkillTarget } from "./details.tsx";

type SkillsClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof SkillsRpcs>,
  RpcClientError.RpcClientError
>;

interface Deps {
  readonly client: SkillsClient;
  readonly bridge: Bridge;
  readonly dialogs: TuiDialogsService;
  readonly refreshCommands: Effect.Effect<void, { readonly message: string }>;
}

const makePanel = () => {
  const [folders, setFolders] = createSignal<ReadonlyArray<SkillFolder>>([]);

  const [query, setQuery] = createSignal("");

  const [selected, setSelected] = createSignal<string>();

  const [problem, setProblem] = createSignal("");

  const [status, setStatus] = createSignal<"loading" | "ready" | "deleting">("loading");

  const find = (path: string | undefined) =>
    folders()
      .flatMap((folder) => folder.entries)
      .find((skill) => skill.path === path);

  return {
    folders,
    setFolders,
    query,
    setQuery,
    selected,
    setSelected,
    problem,
    setProblem,
    status,
    setStatus,
    find,
  };
};

type Panel = ReturnType<typeof makePanel>;

const refresh = Effect.fn("skills.refreshDialog")(function* (deps: Deps, panel: Panel) {
  const visible = (folders: ReadonlyArray<SkillFolder>) =>
    folders
      .flatMap((folder) => folder.entries)
      .filter((skill) => matchIndices(panel.query(), skill.name) !== undefined);

  const previous = visible(panel.folders());

  const index = Math.max(
    0,
    previous.findIndex((skill) => skill.path === panel.selected()),
  );

  const folders = yield* deps.client["skills/inventory"]();

  const next = visible(folders);

  const selected =
    next.find((skill) => skill.path === panel.selected()) ?? next[Math.min(index, next.length - 1)];

  panel.setSelected(selected?.path);

  panel.setFolders(folders);

  yield* deps.refreshCommands;
});

const load = Effect.fn("skills.loadDialog")(function* (deps: Deps, panel: Panel) {
  panel.setProblem("");

  panel.setStatus("loading");

  yield* refresh(deps, panel).pipe(
    Effect.catch((error) => Effect.sync(() => panel.setProblem(error.message))),
    Effect.ensuring(Effect.sync(() => panel.setStatus("ready"))),
  );
});

const remove = Effect.fn("skills.deleteFromDialog")(function* (
  deps: Deps,
  panel: Panel,
  skill: ManagedSkill,
  choice: { readonly mode: DeleteSkillRequest["mode"]; readonly close: () => void },
) {
  panel.setProblem("");

  yield* deps.client["skills/delete"]({
    id: skill.id,
    revision: skill.revision,
    mode: choice.mode,
  }).pipe(Effect.catch((error) => Effect.sync(() => panel.setProblem(error.message))));

  // Even a failed request can have deleted its target; never keep a stale inventory.
  yield* refresh(deps, panel).pipe(
    Effect.catch((error) =>
      Effect.sync(() => panel.setProblem(`${panel.problem()} ${error.message}`.trim())),
    ),
  );

  panel.setStatus("ready");
  choice.close();
});

const confirm = (deps: Deps, panel: Panel, path: string) => {
  if (panel.status() !== "ready") return;

  const skill = panel.find(path);

  if (!skill) return;

  const isGlobal = panel
    .folders()
    .some((folder) => folder.isGlobal && folder.entries.includes(skill));

  deps.dialogs.show((dialog) => (
    <DeleteSkillDialog
      {...dialog}
      skill={skill}
      isGlobal={isGlobal}
      isWorking={panel.status() === "deleting"}
      remove={(mode) => {
        if (panel.status() === "deleting") return;

        panel.setStatus("deleting");
        deps.bridge.run(remove(deps, panel, skill, { mode, close: dialog.close }));
      }}
    />
  ));
};

function Details(props: { readonly panel: Panel; readonly selected: string | undefined }) {
  const color = useColor();

  return (
    <box flexDirection="column" gap={1}>
      <Show when={props.panel.status() === "loading"}>
        <text fg={color("text.muted")}>Loading skills…</text>
      </Show>
      <Show when={props.panel.find(props.selected)}>
        {(skill) => <SkillTarget skill={skill()} />}
      </Show>
      <For each={props.panel.folders().filter((folder) => folder.problem !== null)}>
        {(folder) => (
          <text fg={color("feedback.warning")}>{`${folder.path}: ${folder.problem}`}</text>
        )}
      </For>
      <Show when={props.panel.problem()}>
        {(problem) => <text fg={color("feedback.danger")}>{problem()}</text>}
      </Show>
    </box>
  );
}

function SkillsDialog(props: DialogProps & { readonly deps: Deps; readonly panel: Panel }) {
  const panel = props.panel;

  return (
    <SelectDialog
      title="Manage skills"
      width={90}
      options={panel
        .folders()
        .flatMap((folder) =>
          folder.entries.map((skill) => ({
            title: skill.name,
            description: skill.description,
            value: skill.path,
            category: folder.path,
            trailing: locationLabel(skill),
          })),
        )}
      categories={panel.folders().map((folder) => folder.path)}
      current={panel.selected()}
      filter={{ query: panel.query(), onInput: panel.setQuery }}
      onHighlight={panel.setSelected}
      close={props.close}
      actions={[
        {
          key: "ctrl+x",
          label: "delete",
          keepsOpen: true,
          run: (path) => {
            confirm(props.deps, panel, path);
          },
        },
      ]}
      dialogActions={[
        {
          key: "ctrl+r",
          label: "refresh",
          run: () => {
            if (panel.status() === "ready") props.deps.bridge.run(load(props.deps, panel));
          },
        },
      ]}
      footer={(selected) => <Details panel={panel} selected={selected} />}
    />
  );
}

export const showSkillsDialog = (deps: Deps) => {
  const panel = makePanel();
  deps.dialogs.show((dialog) => <SkillsDialog {...dialog} deps={deps} panel={panel} />);
  deps.bridge.run(load(deps, panel));
};
