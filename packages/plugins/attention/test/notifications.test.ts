/** Notification delivery does not require focus tracking or a native sound player. */

import { expect } from "bun:test";

import { Effect, Layer, Stream } from "effect";

import { SessionId, Synced } from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";

import { chimeWith } from "../src/tui/chimes.ts";
import { notifyWith } from "../src/tui/notifications.ts";

effectTest(
  "terminal notifications work without audio and use generic wording",
  Effect.gen(function* () {
    const banners: Array<readonly [string, string | undefined]> = [];

    const renderer = {
      triggerNotification: (message: string, title?: string) => {
        banners.push([message, title]);

        return true;
      },
    };

    yield* notifyWith(renderer, "turn-ended", true, Effect.void);
    yield* notifyWith(renderer, "input-wait", true, Effect.void);

    expect(banners).toEqual([
      ["Response ready", "Liminal"],
      ["Input needed", "Liminal"],
    ]);
  }),
  Layer.empty,
);

effectTest(
  "disabled notifications suppress both banner and sound",
  Effect.gen(function* () {
    const outputs: Array<string> = [];

    const renderer = {
      triggerNotification: () => {
        outputs.push("banner");

        return true;
      },
    };

    yield* notifyWith(
      renderer,
      "input-wait",
      false,
      Effect.sync(() => {
        outputs.push("sound");
      }),
    );

    expect(outputs).toEqual([]);
  }),
  Layer.empty,
);

for (const delivery of ["unsupported", "throws"] as const) {
  effectTest(
    `sound still plays when terminal notification delivery ${delivery}`,
    Effect.gen(function* () {
      const played: Array<string> = [];

      const renderer = {
        triggerNotification: () => {
          if (delivery === "throws") throw new Error("Terminal output unavailable");

          return false;
        },
      };

      yield* notifyWith(
        renderer,
        "turn-ended",
        true,
        Effect.sync(() => {
          played.push("sound");
        }),
      );

      expect(played).toEqual(["sound"]);
    }),
    Layer.empty,
  );
}

effectTest(
  "only new input waits in the displayed session request terminal notifications",
  Effect.gen(function* () {
    const sessionId = SessionId.make("displayed");
    const wait = { sessionId, source: "commit", id: "review" };
    const banners: Array<string> = [];

    const renderer = {
      triggerNotification: (message: string) => {
        banners.push(message);

        return true;
      },
    };

    yield* chimeWith(
      sessionId,
      Stream.make(Synced.make({})),
      Stream.make([], [{ ...wait, sessionId: SessionId.make("other") }], [wait], [wait], []),
      (chime) => notifyWith(renderer, chime, true, Effect.void),
    ).pipe(Stream.runDrain);

    expect(banners).toEqual(["Input needed"]);
  }),
  Layer.empty,
);
