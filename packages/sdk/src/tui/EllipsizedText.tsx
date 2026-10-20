/** A shrinking single-line title, cut at grapheme boundaries with a trailing ellipsis. */

import { type BoxRenderable, measureEditText } from "@opentui/core";
import { type JSX, useRenderer } from "@opentui/solid";
import { createMemo, createSignal } from "solid-js";

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

export function EllipsizedText(props: {
  readonly text: string;
  readonly fg: string;
  readonly children?: (visible: string) => JSX.Element;
}) {
  const renderer = useRenderer();
  const [body, setBody] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);
  const measure = (text: string) => measureEditText(text, { widthMethod: renderer.widthMethod });

  const visible = createMemo(() => {
    if (columns() < 1) return "";
    if (measure(props.text) <= columns()) return props.text;

    let prefix = "";

    for (const { segment } of graphemes.segment(props.text)) {
      if (measure(prefix + segment + "…") > columns()) break;
      prefix += segment;
    }

    return prefix + "…";
  });

  return (
    <box
      ref={setBody}
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      onSizeChange={() => setColumns(body()?.width ?? 0)}
    >
      <text wrapMode="none" fg={props.fg}>
        {props.children === undefined ? visible() : props.children(visible())}
      </text>
    </box>
  );
}
