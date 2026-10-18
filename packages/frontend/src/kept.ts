/**
 * Values parts keep: each survives its part's reloads, and all of them go to the next process as a
 * handoff when the app restarts.
 */

import { Option, Schema } from "effect";

import type { Kept } from "@liminal/sdk";

/** Every kept value, encoded, by `plugin/key`. */
export type Handoff = Readonly<Record<string, Schema.Json>>;

interface Held {
  readonly kept: object;
  readonly encoded: () => Option.Option<Schema.Json>;
}

export interface KeptStore {
  readonly keep: <A>(
    name: string,
    schema: Schema.Codec<A, Schema.Json>,
    initial: () => A,
  ) => Kept<A>;
  /** Every value kept so far, encoded. */
  readonly handoff: () => Handoff;
}

/** A store that starts from `handed`, the previous process's values. */
export const makeKeptStore = (handed: Handoff): KeptStore => {
  const held = new Map<string, Held>();

  const make = <A>(name: string, schema: Schema.Codec<A, Schema.Json>, initial: () => A) => {
    let value = Option.getOrElse(Schema.decodeUnknownOption(schema)(handed[name]), initial);

    const kept: Kept<A> = {
      get: () => value,
      set: (next) => {
        value = next;
      },
    };

    held.set(name, { kept, encoded: () => Schema.encodeOption(schema)(value) });

    return kept;
  };

  return {
    keep: <A>(name: string, schema: Schema.Codec<A, Schema.Json>, initial: () => A) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a name is kept with one schema, so its value has that schema's type.
      (held.get(name)?.kept as Kept<A> | undefined) ?? make(name, schema, initial),
    handoff: () =>
      Object.fromEntries(
        [...held].flatMap(([name, each]) =>
          Option.match(each.encoded(), { onNone: () => [], onSome: (json) => [[name, json]] }),
        ),
      ),
  };
};
