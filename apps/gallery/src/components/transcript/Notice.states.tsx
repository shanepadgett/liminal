import type { State } from "../../entries.ts";
import { Notice } from "./Notice.tsx";

export const noticeStates: readonly [State, ...State[]] = [
  {
    name: "Kinds",
    fill: "page",
    view: () => (
      <box>
        <Notice level="info" text="Switched to claude-opus-4.1." />
        <Notice level="warning" text="The provider is overloaded. Trying again, attempt 2." />
        <Notice level="error" text="The turn stopped: the provider is still overloaded." />
      </box>
    ),
  },
];
