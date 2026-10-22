import type { State } from "../entries.ts";
import { Inked, useStream } from "./Ink.tsx";

const PARAGRAPH =
  "The retry runs in two places: recovery.ts retries the request, and turn.ts retries the step when the request fails. Keep the one in recovery.ts, since it knows the provider's retry-after.";

function Streaming() {
  const head = useStream(PARAGRAPH.length);

  return (
    <box width={60}>
      <Inked text={PARAGRAPH} shown={head()} role="text.base" />
    </box>
  );
}

export const inkStates: readonly [State, ...State[]] = [
  { name: "Streaming", fill: "page", view: () => <Streaming /> },
  {
    name: "Half out",
    fill: "page",
    view: () => (
      <box width={60}>
        <Inked text={PARAGRAPH} shown={70} role="text.base" />
      </box>
    ),
  },
];
