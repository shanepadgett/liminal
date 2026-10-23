/** `@` tags: what a draft can tag, and the text each tag adds to the message that sends it. */
import { type Effect, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { Registry } from "@shanepadgett/liminal-core";

export const TagKind = Schema.Literals(["file", "folder"]);
export type TagKind = typeof TagKind.Type;

/** What a draft can tag. */
export const TagRow = Schema.Struct({
  kind: TagKind,
  /** The text after `@`; a folder's ends in `/`. */
  tag: Schema.String,
});

export type TagRow = typeof TagRow.Type;

/** A row as the `@` list gets it. */
export const ListedTag = Schema.Struct({
  ...TagRow.fields,
  /** Higher for tags sent often and lately; 0 for one never sent. */
  frecency: Schema.Finite,
});

export type ListedTag = typeof ListedTag.Type;

export interface TagSource {
  readonly rows: Effect.Effect<ReadonlyArray<TagRow>>;
  /** The text part `tag` adds to a message; none when this source does not know it. */
  readonly attach: (tag: string) => Effect.Effect<Option.Option<string>>;
}

/** Where tags come from; for a tag two sources know, the one added first attaches it. */
export class TagSources extends Registry.Service<TagSources, TagSource>()("tags/TagSources") {}

/** What screens call. */
export class TagsRpc extends RpcGroup.make(
  Rpc.make("tags/list", { success: Schema.Array(ListedTag) }),
) {}

/** `tag` as a draft writes it: `@path`, or `@"path"` when it holds a space. */
export const tagText = (tag: string) => (/\s/.test(tag) ? `@"${tag}"` : `@${tag}`);

const TAG = /(?:^|\s)@(?:"([^"]+)"|(\S+))/g;

/** Punctuation that ends a sentence rather than a path, as in `see @a.ts.` */
const TRAILING = /[.,;:!?)]+$/;

/** The distinct tags written in `text`, in order. */
export const tagsIn = (text: string): ReadonlyArray<string> => {
  const tags = [...text.matchAll(TAG)].map(
    ([, quoted, plain]) => quoted ?? (plain ?? "").replace(TRAILING, ""),
  );

  return [...new Set(tags.filter((tag) => tag !== ""))];
};
