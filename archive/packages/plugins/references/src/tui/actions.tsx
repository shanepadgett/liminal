/**
 * What the references dialog's keys run: each calls the server and notes its progress, success or
 * failure on the row it acts on, then lists the clones again.
 */

import { Effect, Predicate, Stream } from "effect";
import type { RpcClient, RpcClientError, RpcGroup } from "effect/rpc";

import type { SessionId } from "@liminal/sdk";
import {
  type Bridge,
  ConfirmDialog,
  DialogFrame,
  type DialogProps,
  PromptField,
  SelectDialog,
  type TuiDialogsService,
  type TuiToastsService,
} from "@liminal/sdk/tui";

import { type CloneProgress, referenceNameOf, type ReferencesRpcs } from "../contract.ts";
import type { Panel } from "./panel.ts";
import type { DialogActions } from "./ReferencesDialog.tsx";

/** The client of the references commands. */
export type ReferencesClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof ReferencesRpcs>,
  RpcClientError.RpcClientError
>;

export interface ActionDeps {
  readonly client: ReferencesClient;
  readonly bridge: Bridge;
  readonly dialogs: TuiDialogsService;
  readonly toasts: TuiToastsService;
  readonly session: SessionId;
}

const PULL_CONCURRENCY = 4;

const PHASE_WORDS: Readonly<Record<CloneProgress["phase"], string>> = {
  receiving: "↓",
  resolving: "resolving",
  updating: "checkout",
};

const progressText = ({ phase, percent }: CloneProgress) => `${PHASE_WORDS[phase]} ${percent}%`;

/** Runs `action` for the row `name`, noting `working` while it runs and git's line if it fails. */
const onRow = <A, E extends { readonly message: string }>(
  panel: Panel,
  name: string,
  action: Effect.Effect<A, E>,
  working = "…",
) =>
  Effect.sync(() => {
    panel.setNote(name, working);
  }).pipe(
    Effect.andThen(action),
    Effect.tap(() =>
      Effect.sync(() => {
        panel.setNote(name);
      }),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => {
        panel.setNote(name, `! ${error.message}`);
      }),
    ),
  );

const refresh = (deps: ActionDeps, panel: Panel) =>
  deps.client["references/list"]().pipe(
    Effect.map((references) => {
      panel.setReferences(references);
    }),
    Effect.ignore,
  );

const clone = (deps: ActionDeps, panel: Panel, url: string) => {
  const name = referenceNameOf(url);

  if (name === "") {
    deps.toasts.show({
      kind: "error",
      title: "References",
      message:
        "Could not find a name in that URL. Use a git URL such as https://github.com/owner/repo.",
    });

    return;
  }

  panel.addPending(name);

  const cloning = deps.client["references/clone"]({ url }).pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => {
        if (Predicate.isTagged(event, "CloneProgress")) panel.setNote(name, progressText(event));
      }),
    ),
  );

  deps.bridge.run(
    onRow(panel, name, cloning, "starting").pipe(
      Effect.andThen(refresh(deps, panel)),
      Effect.tap(() =>
        Effect.sync(() => {
          panel.dropPending(name);
        }),
      ),
      Effect.ignore,
    ),
  );
};

const askUrl = (deps: ActionDeps, panel: Panel) => {
  deps.dialogs.show((props: DialogProps) => (
    <DialogFrame title="Clone a reference" hints={[["enter", "clone"]]} close={props.close}>
      <PromptField
        question="Git URL"
        isSecret={false}
        onSubmit={(url) => {
          props.close();
          if (url.trim() !== "") clone(deps, panel, url.trim());
        }}
      />
    </DialogFrame>
  ));
};

const pullAll = (deps: ActionDeps, panel: Panel) => {
  const names = panel.rows().flatMap((row) => (row.isCloned ? [row.reference.name] : []));

  const pull = (name: string) =>
    onRow(panel, name, deps.client["references/pull"]({ name }), "pulling").pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          panel.setNote(name, "✓");
        }),
      ),
      Effect.ignore,
    );

  deps.bridge.run(
    Effect.forEach(names, pull, { concurrency: PULL_CONCURRENCY, discard: true }).pipe(
      Effect.andThen(refresh(deps, panel)),
    ),
  );
};

const chooseBranch = (deps: ActionDeps, panel: Panel, name: string) => {
  const current = panel.rows().find((row) => row.reference.name === name)?.reference.branch;

  const show = (branches: ReadonlyArray<string>) => {
    deps.dialogs.show((props: DialogProps) => (
      <SelectDialog
        title={`Branch of ${name}`}
        options={branches.map((branch) => ({ title: branch, value: branch }))}
        current={current}
        close={props.close}
        onSelect={(branch) => {
          deps.bridge.run(
            onRow(panel, name, deps.client["references/switch"]({ name, branch })).pipe(
              Effect.andThen(refresh(deps, panel)),
              Effect.ignore,
            ),
          );
        }}
      />
    ));
  };

  deps.bridge.run(
    onRow(panel, name, deps.client["references/branches"]({ name })).pipe(
      Effect.map(show),
      Effect.ignore,
    ),
  );
};

/** Deletes `name` after a confirm, taking it off the session if it was attached. */
const confirmRemove = (
  deps: ActionDeps,
  panel: Panel,
  name: string,
  attached: () => ReadonlyArray<string>,
) => {
  deps.dialogs.show((props: DialogProps) => (
    <ConfirmDialog
      title="Delete reference"
      question={`Delete ${name} from disk?`}
      action="delete"
      close={props.close}
      onConfirm={() => {
        panel.unmark(name);
        const kept = attached().filter((each) => each !== name);

        const detach =
          kept.length === attached().length
            ? Effect.void
            : Effect.ignore(
                deps.client["references/attach"]({ session: deps.session, names: kept }),
              );

        deps.bridge.run(
          onRow(panel, name, deps.client["references/remove"]({ name })).pipe(
            Effect.andThen(detach),
            Effect.andThen(refresh(deps, panel)),
            Effect.ignore,
          ),
        );
      }}
    />
  ));
};

export const makeActions = (
  deps: ActionDeps,
  panel: Panel,
  attached: () => ReadonlyArray<string>,
): DialogActions => ({
  attach: () => {
    const names = panel
      .rows()
      .flatMap((row) =>
        row.isCloned && panel.marked().has(row.reference.name) ? [row.reference.name] : [],
      );

    deps.bridge.run(deps.client["references/attach"]({ session: deps.session, names }));
  },
  clone: () => {
    askUrl(deps, panel);
  },
  pullAll: () => {
    pullAll(deps, panel);
  },
  branch: (name) => {
    chooseBranch(deps, panel, name);
  },
  open: (name) => {
    deps.bridge.run(
      onRow(panel, name, deps.client["references/open"]({ name })).pipe(Effect.ignore),
    );
  },
  remove: (name) => {
    confirmRemove(deps, panel, name, attached);
  },
});
