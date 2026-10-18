/**
 * Toasts: short feedback on something just done in the TUI. One shows at a time; a new one replaces
 * it. Every kind times out, errors included; the timer stops while the mouse is over it. What
 * happens in a session is a transcript notice, not a toast.
 */

import { Context, Duration, Effect, FiberHandle } from "effect";
import { type Accessor, createSignal } from "solid-js";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastMessage {
  readonly kind: ToastKind;
  readonly title: string;
  readonly message?: string;
}

export interface TuiToastsService {
  /** Shows `toast` in place of the current one. */
  readonly show: (toast: ToastMessage) => void;
  /** The toast showing, if any. */
  readonly current: Accessor<ToastMessage | undefined>;
  /** Stops the timer while `held`; letting go starts it again. */
  readonly hold: (held: boolean) => void;
}

/** The toasts; every UI part's setup can read them. */
export class TuiToasts extends Context.Service<TuiToasts, TuiToastsService>()(
  "liminal/sdk/TuiToasts",
) {}

/** How long a toast shows. */
const SHOWN_FOR = Duration.seconds(4);

/** No toast yet; the timer stops when the caller's Scope closes. */
export const makeTuiToasts = Effect.gen(function* () {
  const [current, setCurrent] = createSignal<ToastMessage>();
  const timer = yield* FiberHandle.makeRuntime<never>();

  const expire = Effect.sleep(SHOWN_FOR).pipe(
    Effect.andThen(
      Effect.sync(() => {
        setCurrent(undefined);
      }),
    ),
  );

  const toasts: TuiToastsService = {
    show: (toast) => {
      setCurrent(toast);
      timer(expire);
    },
    current,
    hold: (held) => {
      if (current() === undefined) return;

      timer(held ? Effect.never : expire);
    },
  };

  return toasts;
});
