/**
 * Environment's TUI part: the sidebar's Session section, above Context, with the folder Liminal
 * runs in and the git branch.
 */

import { Effect } from "effect";
import { Show } from "solid-js";

import { ChatSlots } from "@liminal/chat/contract";
import {
  defineTui,
  makeBridge,
  SidebarNote,
  SidebarSection,
  SidebarStat,
  TuiHost,
} from "@liminal/sdk/tui";

import { EnvironmentRpcs, type SessionInfo } from "./contract.ts";

/** Where the section goes: above Context, which is at 0. */
const SECTION_ORDER = -10;

/** The sidebar's room for a value beside its label. */
const VALUE_COLUMNS = 28;

/** `text`, cut from the left with an ellipsis when it is wider than `columns`. */
const fit = (text: string, columns: number) =>
  text.length <= columns ? text : `…${text.slice(text.length - columns + 1)}`;

/** What shows until the first read: no folder yet. */
const UNREAD: SessionInfo = { folder: "" };

function Session(props: { readonly info: SessionInfo }) {
  return (
    <SidebarSection title="Session">
      <Show when={props.info.folder !== ""} fallback={<SidebarNote text="Reading…" />}>
        <SidebarStat label="folder" value={fit(props.info.folder, VALUE_COLUMNS)} />
        <Show when={props.info.branch}>
          {(branch) => <SidebarStat label="branch" value={fit(branch(), VALUE_COLUMNS)} />}
        </Show>
      </Show>
    </SidebarSection>
  );
}

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const client = yield* host.client(EnvironmentRpcs);

    yield* host.register(ChatSlots.sidebar, { id: "session", order: SECTION_ORDER }, () => {
      const info = bridge.watch(client["environment/session"](), UNREAD);

      return <Session info={info()} />;
    });
  }),
});
