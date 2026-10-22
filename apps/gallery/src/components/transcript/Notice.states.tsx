import type { State } from "../../entries.ts";
import { Notice } from "./Notice.tsx";

export const noticeStates: readonly [State, ...State[]] = [
  {
    name: "Kinds",
    fill: "page",
    view: () => (
      <box>
        <Notice kind="info" text="Switched to claude-opus-4.1." />
        <Notice kind="warning" text="The provider is overloaded (529). Retrying in 4s." />
        <Notice kind="error" text="The turn stopped: the request was cancelled." />
      </box>
    ),
  },
];
