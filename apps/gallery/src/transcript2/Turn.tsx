/**
 * One turn of the conversation at one moment: the user's prompt or their answers to a form, then
 * what the assistant said with the rows of work between, the growing tip, and once the work is
 * over, how long it worked and the answer or the form it left. Everything the assistant says is
 * full-brightness text and all its work is gray, so the two never blur; every block is a line apart
 * on one left edge.
 */

import { createSignal, Index, Show } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { UserPrompt } from "../transcript/UserPrompt.tsx";
import { Answers } from "./Answers.tsx";
import { Asked } from "./Asked.tsx";
import type { Block, Ending, TurnFrame } from "./frame.ts";
import { Said } from "./Said.tsx";
import type { Prompt } from "./script.ts";
import { Tip } from "./Tip.tsx";
import { WorkedFor } from "./WorkedFor.tsx";
import { WorkRows } from "./WorkRows.tsx";

function BlockView(props: { readonly color: RoleColor; readonly block: Block }) {
  const said = () => (props.block.kind === "said" ? props.block : undefined);
  const work = () => (props.block.kind === "work" ? props.block : undefined);

  return (
    <box marginTop={1}>
      <Show when={said()}>{(words) => <Said color={props.color} streaming={words()} />}</Show>
      <Show when={work()}>
        {(done) => <WorkRows color={props.color} groups={done().groups} dim={done().dim} />}
      </Show>
    </box>
  );
}

function Sent(props: { readonly color: RoleColor; readonly prompt: Prompt }) {
  const [isOpen, setIsOpen] = createSignal(false);

  const text = () => (props.prompt.kind === "text" ? props.prompt : undefined);
  const answers = () => (props.prompt.kind === "answers" ? props.prompt : undefined);

  return (
    <>
      <Show when={text()}>
        {(sent) => (
          <UserPrompt
            color={props.color}
            text={sent().text}
            isExpanded={isOpen()}
            onToggle={() => setIsOpen((was) => !was)}
          />
        )}
      </Show>
      <Show when={answers()}>
        {(sent) => (
          <Answers
            color={props.color}
            title={sent().title}
            answered={sent().answered}
            context={sent().context}
          />
        )}
      </Show>
    </>
  );
}

function Closing(props: { readonly color: RoleColor; readonly ending: Ending }) {
  const answer = () => (props.ending.final.kind === "answer" ? props.ending.final : undefined);
  const form = () => (props.ending.final.kind === "questions" ? props.ending.final : undefined);

  return (
    <box flexDirection="column" marginTop={1}>
      <WorkedFor color={props.color} ending={props.ending} />
      <box marginTop={1}>
        <Show when={answer()}>
          {(said) => <Said color={props.color} streaming={said().answer} />}
        </Show>
        <Show when={form()}>
          {(left) => (
            <Asked
              color={props.color}
              title={left().title}
              count={left().count}
              drawn={props.ending.drawn}
            />
          )}
        </Show>
      </box>
    </box>
  );
}

export function Turn(props: {
  readonly color: RoleColor;
  readonly prompt: Prompt;
  readonly frame: TurnFrame;
}) {
  return (
    <box flexDirection="column">
      <Sent color={props.color} prompt={props.prompt} />
      <Index each={props.frame.blocks}>
        {(block) => <BlockView color={props.color} block={block()} />}
      </Index>
      <Tip color={props.color} tip={props.frame.tip} />
      <Show when={props.frame.ending}>
        {(ending) => <Closing color={props.color} ending={ending()} />}
      </Show>
    </box>
  );
}
