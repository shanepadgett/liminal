/**
 * How far a stretch of work has dimmed, from 0 to 1. Work already left behind when it is drawn
 * starts dim; work left behind while on screen fades to dim over `DIM_MS`.
 */

import { type Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";

/** How long work takes to dim once left behind. */
const DIM_MS = 600;

/** Milliseconds between steps of the fade. */
const STEP_MS = 40;

export const createDim = (isLeft: Accessor<boolean>): Accessor<number> => {
  const [dim, setDim] = createSignal(isLeft() ? 1 : 0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };

  createEffect(
    on(
      isLeft,
      (left) => {
        stop();

        if (!left) {
          setDim(0);

          return;
        }

        const start = Date.now() - dim() * DIM_MS;

        timer = setInterval(() => {
          const now = Math.min(1, (Date.now() - start) / DIM_MS);
          setDim(now);
          if (now === 1) stop();
        }, STEP_MS);
      },
      { defer: true },
    ),
  );

  onCleanup(stop);

  return dim;
};
