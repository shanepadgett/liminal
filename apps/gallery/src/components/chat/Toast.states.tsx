import type { State } from "../../entries.ts";
import { Toast } from "./Toast.tsx";

export const toastStates: readonly [State, ...State[]] = [
  {
    name: "Info",
    fill: "center",
    view: () => (
      <Toast kind="info" title="Model switched" message="claude-opus-4.1 for this session" />
    ),
  },
  {
    name: "Success",
    fill: "center",
    view: () => (
      <Toast
        kind="success"
        title="Connected to OpenRouter"
        message="Its models are in the picker."
      />
    ),
  },
  {
    name: "Warning",
    fill: "center",
    view: () => <Toast kind="warning" title="Context nearly full" message="181k of 200k tokens" />,
  },
  {
    name: "Error",
    fill: "center",
    view: () => (
      <Toast kind="error" title="Sign-in failed" message="The browser window was closed." />
    ),
  },
];
