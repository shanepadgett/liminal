/**
 * References' TUI part: `/references` opens the dialog of clones for the session on screen, and the
 * sidebar's References section lists the session's attached clones.
 */

import { Effect, Option, Stream } from "effect";
import { type Accessor, createSignal, For, onCleanup, Show } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import {
  defineTui,
  makeBridge,
  SidebarNote,
  SidebarSection,
  TuiCommands,
  TuiDialogs,
  TuiHost,
  TuiToasts,
} from "@liminal/sdk/tui";

import { ReferencesRpcs } from "./contract.ts";
import { type ActionDeps, makeActions } from "./tui/actions.tsx";
import { makePanel } from "./tui/panel.ts";
import { ReferencesDialog } from "./tui/ReferencesDialog.tsx";

/** After processes' section. */
const SECTION_ORDER = 40;

/** After approval's mode label; draws nothing. */
const LINE_ORDER = 20;

const NONE: ReadonlyArray<string> = [];

/** Lists the clones and the session's attached ones, then opens the dialog over them. */
const showDialog = (
  deps: ActionDeps,
  watchAttached: (session: SessionId) => Accessor<ReadonlyArray<string>>,
) =>
  Effect.gen(function* () {
    const references = yield* deps.client["references/list"]();

    const attached = yield* Stream.runHead(
      deps.client["references/attached"]({ session: deps.session }),
    ).pipe(Effect.map(Option.getOrElse(() => NONE)));

    const panel = makePanel(references, attached);

    deps.dialogs.show((dialog) => {
      const actions = makeActions(deps, panel, watchAttached(deps.session));

      return <ReferencesDialog panel={panel} actions={actions} close={dialog.close} />;
    });
  });

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const commands = yield* TuiCommands;
    const dialogs = yield* TuiDialogs;
    const toasts = yield* TuiToasts;
    const client = yield* host.client(ReferencesRpcs);
    const [onScreen, setOnScreen] = createSignal<SessionId | undefined>();

    const watchAttached = (session: SessionId) =>
      bridge.watch(client["references/attached"]({ session }), NONE);

    yield* commands.register([
      {
        name: "references.open",
        title: "References",
        desc: "Clone repositories to read and attach them to this session",
        category: "Session",
        slash: { name: "references" },
        palette: true,
        run: () => {
          const session = onScreen();

          if (session !== undefined) {
            bridge.run(showDialog({ client, bridge, dialogs, toasts, session }, watchAttached));
          }
        },
      },
    ]);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "references", order: LINE_ORDER },
      function OnScreen(props: { readonly sessionId: SessionId }) {
        setOnScreen(props.sessionId);

        onCleanup(() => {
          setOnScreen();
        });

        return null;
      },
    );

    yield* host.register(
      ChatSlots.sidebar,
      { id: "references", order: SECTION_ORDER },
      function ReferencesSection(props: { readonly sessionId: SessionId }) {
        const attached = watchAttached(props.sessionId);

        return (
          <Show when={attached().length > 0}>
            <SidebarSection title="References">
              <For each={attached()}>{(name) => <SidebarNote text={name} />}</For>
            </SidebarSection>
          </Show>
        );
      },
    );
  }),
});
