import type { State } from "../../entries.ts";
import { atBottom } from "./Composer.states.tsx";
import { type Notification, Notifications } from "./Notifications.tsx";
import { SLASH_COMMANDS } from "./SlashMenu.states.tsx";
import { SlashMenu } from "./SlashMenu.tsx";

export const CONNECTED: Notification = {
  id: "connected",
  kind: "success",
  title: "Connected to OpenRouter",
  message: "Its models are in the picker.",
  remaining: 0.8,
};

export const USAGE: Notification = {
  id: "usage",
  kind: "warning",
  title: "Weekly usage at 82%",
  message: "Resets Monday.",
  remaining: 0.4,
};

const REFUSED: Notification = {
  id: "refused",
  kind: "error",
  title: "OpenAI refused the request (429)",
  message: "Retrying in 20s.",
  remaining: 1,
};

const UPDATE: Notification = {
  id: "update",
  kind: "info",
  title: "Liminal 0.2.0 is out",
  remaining: 0.15,
};

/** A command that needs the session idle, tried while a turn runs; the draft keeps it. */
const TURN_RUNNING: Notification = {
  id: "turn-running",
  kind: "warning",
  title: "/commit runs once the turn ends",
  message: "Send it again when the turn is done.",
  remaining: 0.7,
};

/** The notifications in place, above the composer. */
const above = (notifications: readonly Notification[], draft = "", isWorking = false) =>
  atBottom({
    draft,
    isWorking,
    notifications: () => <Notifications notifications={notifications} />,
  });

export const notificationsStates: readonly [State, ...State[]] = [
  { name: "One", fill: "screen", view: above([CONNECTED]) },
  { name: "Stacked", fill: "screen", view: above([REFUSED, USAGE]) },
  { name: "Each kind", fill: "screen", view: above([UPDATE, CONNECTED, USAGE, REFUSED]) },
  {
    name: "Command during a turn",
    fill: "screen",
    view: above([TURN_RUNNING], "/commit keep the docs separate", true),
  },
  {
    name: "Over the slash menu",
    fill: "screen",
    view: atBottom({
      draft: "/co",
      notifications: () => <Notifications notifications={[CONNECTED]} />,
      menu: () => <SlashMenu commands={SLASH_COMMANDS} typed="co" under={0} />,
    }),
  },
];
