/**
 * The models picker: a section per provider, each row a model by its id without the provider, its
 * context window and whether it is the default. Enter picks it for this screen's next send;
 * `ctrl+d` saves it as the default and keeps the picker open.
 */
import type { ModelListing } from "@shanepadgett/liminal-model/contract";
import type { kit, PickerSpec } from "@shanepadgett/liminal-tui";

import { MODELS_PICKER } from "../contract.ts";
import { choiceOf, type ModelState } from "./state.ts";

/** `200000` as `200k`, `1000000` as `1M`. */
const tokens = (count: number) =>
  count >= 1_000_000 ? `${Math.round(count / 100_000) / 10}M` : `${Math.round(count / 1000)}k`;

const rowOf = (listing: ModelListing, defaultModel: string | undefined): kit.PickerRow => {
  const window = listing.contextWindow === undefined ? [] : [tokens(listing.contextWindow)];
  const tag = listing.id === defaultModel ? ["default"] : [];
  const detail = [...window, ...tag].join(" · ");
  const title = listing.id.slice(listing.id.indexOf("/") + 1);
  const row = { id: listing.id, title, section: listing.provider };

  return detail === "" ? row : { ...row, detail };
};

/** The row's model at the line's thinking level when it takes it, else at its own default. */
export const choiceFor = (state: ModelState, row: kit.PickerRow) => {
  const thinking = state.line()?.thinking;
  const levels = state.listingOf(row.id)?.thinking ?? [];

  return choiceOf(
    row.id,
    thinking !== undefined && levels.includes(thinking) ? thinking : undefined,
  );
};

export const modelsPicker = (
  state: ModelState,
  saveDefault: (row: kit.PickerRow) => void,
): PickerSpec => {
  const initial = state.line()?.model;

  const spec: PickerSpec = {
    name: MODELS_PICKER,
    title: "Models",
    placeholder: "Search models",
    empty: "No models; run liminal connect to sign in to a provider",
    rows: () => state.listings().map((listing) => rowOf(listing, state.saved()?.model)),
    actions: [{ key: "ctrl+d", label: "default", keepsOpen: true, run: saveDefault }],
    onSelect: (row) => {
      state.pick(choiceFor(state, row));
    },
  };

  return initial === undefined ? spec : { ...spec, initial };
};
