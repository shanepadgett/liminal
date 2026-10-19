/** Mermaid fences draw as diagrams once closed, and show their source while open or too wide. */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";

import { PALETTES, resolveRoles, useMarkdownDiagrams, useMarkdownStyle } from "../src/tui/index.ts";

const [palette] = PALETTES;
const color = resolveRoles(palette);

const CLOSED = "```mermaid\nflowchart TD\n  A --> B\n```";

function Markdown(props: { readonly text: string }) {
  const style = useMarkdownStyle(() => color);
  const diagrams = useMarkdownDiagrams(() => color);

  return <markdown content={props.text} syntaxStyle={style()} renderNode={diagrams()} streaming />;
}

const frameOf = async (text: string, width: number) => {
  const setup = await testRender(() => <Markdown text={text} />, { width, height: 20 });
  await setup.renderOnce();
  await Bun.sleep(100);
  await setup.renderOnce();

  return setup.captureCharFrame();
};

test("a closed mermaid fence draws as boxes", async () => {
  const frame = await frameOf(CLOSED, 60);

  expect(frame).toContain("\u2502A\u2502");
  expect(frame).toContain("┌");
  expect(frame).not.toContain("flowchart");
});

test("an open mermaid fence shows its source", async () => {
  const frame = await frameOf("```mermaid\nflowchart TD\n  A --> B", 60);

  expect(frame).toContain("flowchart");
  expect(frame).not.toContain("┌");
});

test("a diagram wider than the block shows its source", async () => {
  const frame = await frameOf(
    "```mermaid\nflowchart LR\n  Alpha --> Beta --> Gamma --> Delta\n```",
    20,
  );

  expect(frame).toContain("flowchart");
  expect(frame).not.toContain("┌");
});

test("a fence that does not parse shows its source", async () => {
  const frame = await frameOf("```mermaid\nnotadiagram here\n```", 60);

  expect(frame).toContain("notadiagram");
});
