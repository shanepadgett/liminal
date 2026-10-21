/**
 * An approval answer in the debug view: one faint line naming the tool, whether it was approved,
 * who answered and why. `✓ shell approved by reviewer (gpt-5-mini): read-only`.
 */

import { Option, Schema } from "effect";

import type { SavedEntry } from "@liminal/sdk";
import { useColor } from "@liminal/sdk/tui";

import { type Answerer, ApprovalRecord } from "../contract.ts";

const decodeRecord = Schema.decodeUnknownOption(ApprovalRecord);

const ANSWERERS: Readonly<Record<Answerer, string>> = {
  mode: "mode",
  "decision-model": "decision model",
  reviewer: "reviewer",
  user: "you",
};

/** The line's words, without the mark. */
const answerLine = (record: ApprovalRecord): string => {
  const model = record.model === undefined ? "" : ` (${record.model})`;
  const verdict = record.approved ? "approved" : "rejected";

  return `${record.tool} ${verdict} by ${ANSWERERS[record.by]}${model}: ${record.reason}`;
};

export function AnswerRow(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  const line = () =>
    Option.match(decodeRecord(props.entry.data), {
      onNone: () => props.entry.text,
      onSome: (record) => `${record.approved ? "✓" : "✕"} ${answerLine(record)}`,
    });

  return <text fg={color("text.faint")}>{line()}</text>;
}
