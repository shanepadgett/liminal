/**
 * One turn: what the user sent, on its own raised band, then everything the reply did, indented.
 * Inputs that join the turn later, such as steers, sit at the left edge as the first does, and each
 * input sticks to the top of the transcript once scrolled past. A closed turn ends in a line that
 * says how it ended. Tool rows stack without space between them; every other item has a blank line
 * above it.
 */

import { Dynamic } from "@opentui/solid";
import { For, Match, Show, Switch } from "solid-js";

import type { Item, Turn as TurnData } from "../view/index.ts";
import { Notice } from "./Notice.tsx";
import { Prompt } from "./Prompt.tsx";
import { Reply } from "./Reply.tsx";
import type { ItemView } from "./slots.ts";
import { StickyRow } from "./sticky.tsx";
import { TurnEnd } from "./TurnEnd.tsx";
import { WorkRow } from "./WorkRow.tsx";

/** Each event kind another plugin draws, and its component. */
export type Renderers = ReadonlyMap<string, ItemView["component"]>;

type ItemOf<K extends Item["kind"]> = Extract<Item, { readonly kind: K }>;

const isKind = <K extends Item["kind"]>(item: Item, kind: K): item is ItemOf<K> =>
  item.kind === kind;

/** `item` when it is of `kind`, for `Match`. */
const asKind = <K extends Item["kind"]>(item: Item, kind: K): ItemOf<K> | undefined =>
  isKind(item, kind) ? item : undefined;

function ItemBody(props: { readonly item: Item; readonly renderers: Renderers }) {
  return (
    <Switch>
      <Match when={asKind(props.item, "input")}>
        {(input) => (
          <StickyRow text={input().text}>
            <Prompt input={input().text} />
          </StickyRow>
        )}
      </Match>
      <Match when={asKind(props.item, "reply")}>
        {(reply) => <Reply text={reply().text} isLive={reply().isLive} />}
      </Match>
      <Match when={asKind(props.item, "tool")}>{(tool) => <WorkRow item={tool()} />}</Match>
      <Match when={asKind(props.item, "notice")}>
        {(notice) => <Notice level={notice().level} text={notice().text} />}
      </Match>
      <Match when={asKind(props.item, "end")}>
        {(end) => <TurnEnd ending={end().ending} model={end().model} ran={end().ran} />}
      </Match>
      <Match when={asKind(props.item, "event")}>
        {(event) => (
          <Show when={props.renderers.get(event().event.kind)}>
            {(component) => <Dynamic component={component()} event={event().event} />}
          </Show>
        )}
      </Match>
    </Switch>
  );
}

/** Replies, tools and notices sit in from the inputs. */
const INDENT = 3;

export function Turn(props: { readonly turn: TurnData; readonly renderers: Renderers }) {
  const isToolAt = (index: number) => props.turn.items[index]?.kind === "tool";

  const spaceAbove = (index: number) =>
    index === 0 || (isToolAt(index) && isToolAt(index - 1)) ? 0 : 1;

  return (
    <box flexShrink={0} gap={1} marginBottom={1}>
      <Show when={props.turn.input}>
        {(input) => (
          <StickyRow text={input()}>
            <Prompt input={input()} />
          </StickyRow>
        )}
      </Show>
      <box>
        <For each={props.turn.items}>
          {(item, index) => (
            <box
              flexShrink={0}
              marginTop={spaceAbove(index())}
              paddingLeft={item.kind === "input" ? 0 : INDENT}
            >
              <ItemBody item={item} renderers={props.renderers} />
            </box>
          )}
        </For>
      </box>
    </box>
  );
}
