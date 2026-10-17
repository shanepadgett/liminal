/**
 * Replays the saved sections and tools, compares them with the current ones and folds a view to
 * messages.
 */

import { Equal, Option, Schema } from "effect";

import type { Entry, ModelContent, ModelPart, ModelTool } from "@liminal/sdk";

import {
  type ContextRequest,
  type PromptSection,
  type SectionChange,
  type SectionState,
  SystemData,
  SystemEntry,
  type ToolChange,
} from "../contract.ts";

const isSystemData = Schema.is(SystemData);

/** What folding reads of an entry; a previewed system entry has no seq yet. */
export type FoldEntry = Pick<Entry, "kind" | "data" | "model">;

/** The system data of a `context/system` entry. */
const systemDataOf = (entry: FoldEntry): SystemData | undefined =>
  entry.kind === SystemEntry.kind && isSystemData(entry.data) ? entry.data : undefined;

const isBaseline = (entry: FoldEntry) => systemDataOf(entry)?.type === "baseline";

/** The sections and tools the model has seen in a view. */
export interface Saved {
  readonly hasBaseline: boolean;
  readonly sections: ReadonlyMap<string, Schema.Json>;
  readonly tools: ReadonlyMap<string, ModelTool>;
}

const applyTool = (tools: Map<string, ModelTool>, { change, tool }: ToolChange) => {
  tools.set(tool.name, { ...tool, offered: change === "offer" });
};

const applySection = (sections: Map<string, Schema.Json>, change: SectionChange) => {
  if (change.type === "set") sections.set(change.key, change.value);
  else sections.delete(change.key);
};

/** Replays every system entry in view, in order; a baseline starts over. */
export const replay = (view: ReadonlyArray<FoldEntry>): Saved => {
  let hasBaseline = false;
  const sections = new Map<string, Schema.Json>();
  const tools = new Map<string, ModelTool>();

  for (const entry of view) {
    const data = systemDataOf(entry);
    if (data === undefined) continue;

    if (data.type === "baseline") {
      hasBaseline = true;
      sections.clear();
      tools.clear();
      for (const section of data.sections) sections.set(section.key, section.value);
      for (const tool of data.tools) tools.set(tool.name, tool);
    } else {
      for (const change of data.sections) applySection(sections, change);
      for (const change of data.tools) applyTool(tools, change);
    }
  }

  return { hasBaseline, sections, tools };
};

/** A section with what its read found. */
export interface ReadSection {
  readonly section: PromptSection;
  readonly state: SectionState;
}

/** Sorts by order, then key. */
export const sortSections = <A extends { readonly section: PromptSection }>(
  sections: ReadonlyArray<A>,
): ReadonlyArray<A> =>
  sections.toSorted(
    (left, right) =>
      left.section.order - right.section.order || left.section.key.localeCompare(right.section.key),
  );

const baseline = (sections: ReadonlyArray<ReadSection>, tools: ReadonlyArray<ModelTool>) => {
  const data: SystemData = {
    type: "baseline",
    sections: sections.flatMap(({ section, state }) =>
      state.type === "present"
        ? [{ key: section.key, value: state.value, text: state.initial }]
        : [],
    ),
    tools,
  };

  return data;
};

/** The section's change from its saved value: none or one. */
const sectionChanges = (
  { section, state }: ReadSection,
  saved: Schema.Json | undefined,
): ReadonlyArray<SectionChange> => {
  if (state.type === "unavailable") return [];

  if (state.type === "removed") {
    return saved === undefined
      ? []
      : [{ type: "removed", key: section.key, text: section.removed(saved) }];
  }

  const text = saved === undefined ? Option.some(state.initial) : state.changedFrom(saved);

  return Option.match(text, {
    onNone: () => [],
    onSome: (changed) => [{ type: "set", key: section.key, value: state.value, text: changed }],
  });
};

/** The tool's change from its saved declaration: none or one. */
const toolChanges = (tool: ModelTool, saved: ModelTool | undefined): ReadonlyArray<ToolChange> => {
  const { offered, ...spec } = tool;

  if (offered) {
    return saved !== undefined && Equal.equals(saved, tool)
      ? []
      : [{ change: "offer", tool: spec }];
  }

  return saved?.offered === true ? [{ change: "withdraw", tool: spec }] : [];
};

/** The system entry the current sections and tools need, or undefined when nothing changed. */
export const diff = (
  saved: Saved,
  sections: ReadonlyArray<ReadSection>,
  tools: ReadonlyArray<ModelTool>,
): SystemData | undefined => {
  if (!saved.hasBaseline) return baseline(sections, tools);

  const current = new Set(sections.map(({ section }) => section.key));
  const names = new Set(tools.map((tool) => tool.name));

  const changedSections = [
    ...sections.flatMap((read) => sectionChanges(read, saved.sections.get(read.section.key))),
    // A section whose plugin is gone is removed without text.
    ...[...saved.sections.keys()]
      .toSorted()
      .flatMap((key): ReadonlyArray<SectionChange> =>
        current.has(key) ? [] : [{ type: "removed", key, text: "" }],
      ),
  ];

  const changedTools = [
    ...tools.flatMap((tool) => toolChanges(tool, saved.tools.get(tool.name))),
    ...[...saved.tools.values()].flatMap(({ offered, ...spec }): ReadonlyArray<ToolChange> =>
      offered && !names.has(spec.name) ? [{ change: "withdraw", tool: spec }] : [],
    ),
  ];

  if (changedSections.length === 0 && changedTools.length === 0) return undefined;

  return { type: "update", sections: changedSections, tools: changedTools };
};

const textPart = (text: string): ModelPart => ({ type: "text", text, providerData: {} });

/** The system message a system entry sends. */
export const systemModel = (data: SystemData): ReadonlyArray<ModelContent> => {
  const texts = data.sections.flatMap((section) =>
    section.text === "" ? [] : [textPart(section.text)],
  );

  const changes: ReadonlyArray<ModelPart> =
    data.type === "update"
      ? data.tools.map(({ change, tool }) => ({ type: "tool-change", change, tool }))
      : [];

  return [{ role: "system", parts: [...texts, ...changes] }];
};

/** The plain text a system entry shows. */
export const systemText = (data: SystemData): string => {
  const sections = data.sections.map((section) => section.key).join(", ");

  const tools =
    data.type === "baseline"
      ? data.tools.map((tool) => (tool.offered ? tool.name : `${tool.name} (not offered)`))
      : data.tools.map(({ change, tool }) => `${change} ${tool.name}`);

  const title = data.type === "baseline" ? "System prompt" : "System prompt update";

  return `${title}: sections ${sections || "none"}; tools ${tools.join(", ") || "none"}`;
};

/**
 * Folds a view to messages from the content saved on each entry; the first baseline leads as the
 * system prompt and declares the request's tools.
 */
export const fold = (
  view: ReadonlyArray<FoldEntry>,
  model: ContextRequest["model"],
): ContextRequest => {
  const lead = view.find(isBaseline);
  const ordered = lead === undefined ? view : [lead, ...view.filter((entry) => entry !== lead)];
  const leadData = lead === undefined ? undefined : systemDataOf(lead);

  return {
    model,
    messages: ordered
      .flatMap((entry) => entry.model ?? [])
      .filter((message) => message.parts.length > 0),
    tools: leadData?.type === "baseline" ? leadData.tools : [],
  };
};
