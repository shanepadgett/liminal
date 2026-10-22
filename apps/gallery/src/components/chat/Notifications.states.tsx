import type { State } from "../../entries.ts";
import { Composer } from "./Composer.tsx";
import { type Notification, Notifications } from "./Notifications.tsx";

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

/** The notifications in place, above an empty composer. */
const above = (notifications: readonly Notification[]) => () => (
  <box width="100%" height="100%" justifyContent="flex-end" paddingBottom={1}>
    <Composer
      draft=""
      model="claude-sonnet-4.5"
      effort="high"
      queued={[]}
      isWorking={false}
      widgets={<Notifications notifications={notifications} />}
    />
  </box>
);

export const notificationsStates: readonly [State, ...State[]] = [
  { name: "One", fill: "screen", view: above([CONNECTED]) },
  { name: "Stacked", fill: "screen", view: above([REFUSED, USAGE]) },
  { name: "Each kind", fill: "screen", view: above([UPDATE, CONNECTED, USAGE, REFUSED]) },
];
