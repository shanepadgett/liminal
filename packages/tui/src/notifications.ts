/**
 * Notifications: short notes any plugin posts, shown above the composer for 5 seconds each, oldest
 * first. Made with Solid signals, so a component reading `shown` redraws as each one empties.
 */
import { Context, Duration, Effect, FiberSet } from "effect";
import { type Accessor, createSignal } from "solid-js";

export type NotificationKind = "info" | "success" | "warning" | "error";

export interface Notification {
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message?: string;
}

/** A notification on screen, with the share of its time left, from 1 as it arrives to 0. */
export interface ShownNotification extends Notification {
  readonly id: number;
  readonly remaining: number;
}

export class Notifications extends Context.Service<
  Notifications,
  {
    readonly post: (notification: Notification) => void;
    /** On screen now, oldest first. */
    readonly shown: Accessor<ReadonlyArray<ShownNotification>>;
  }
>()("tui/Notifications") {}

/** How long each stays. */
const SHOWN_FOR = Duration.seconds(5);

/** How many times its track shortens before it goes. */
const STEPS = 50;

const STEP = Duration.divideUnsafe(SHOWN_FOR, STEPS);

export const makeNotifications = Effect.gen(function* () {
  const fork = yield* FiberSet.makeRuntime();
  const [shown, setShown] = createSignal<ReadonlyArray<ShownNotification>>([]);
  let nextId = 0;

  const setRemaining = (id: number, remaining: number) => {
    setShown((all) => all.map((each) => (each.id === id ? { ...each, remaining } : each)));
  };

  const remove = (id: number) => {
    setShown((all) => all.filter((each) => each.id !== id));
  };

  /** Shortens the track step by step, then takes the notification off the screen. */
  const empty = (id: number) =>
    Effect.forEach(
      Array.from({ length: STEPS }, (_, step) => step + 1),
      (step) =>
        Effect.sleep(STEP).pipe(
          Effect.andThen(
            Effect.sync(() => {
              setRemaining(id, 1 - step / STEPS);
            }),
          ),
        ),
      { discard: true },
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          remove(id);
        }),
      ),
    );

  const post = (notification: Notification) => {
    nextId += 1;
    const id = nextId;
    setShown((all) => [...all, { ...notification, id, remaining: 1 }]);
    fork(empty(id));
  };

  const notifications: Notifications["Service"] = { post, shown };

  return notifications;
});
