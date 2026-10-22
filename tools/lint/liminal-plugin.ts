/** Liminal's oxlint plugin. */
import { definePlugin } from "@oxlint/plugins";

import {
  disableNeedsReason,
  maxCommentWords,
  noCommentedCode,
  noDividerComments,
  noEmDash,
  noJargon,
  noNarrationComments,
  noPlaceholderComments,
  preferJsDoc,
} from "./comment-rules.ts";
import { noEffectRun, noManualTagCheck, noManualTaggedObject } from "./effect-rules.ts";
import {
  contractImports,
  contractNoSideEffects,
  entryIsolation,
  pluginImports,
  viewImports,
} from "./plugin-rules.ts";
import {
  noConditionalEmptySpread,
  noFilterMap,
  noModuleMocking,
  noReflect,
} from "./shape-rules.ts";
import { paddingLines } from "./spacing-rules.ts";
import {
  assertionNeedsReason,
  noChainedAssertions,
  noLooseDictionaries,
  noObjectParameters,
  noRuntimeTypeof,
  noUnknownParameters,
  noUnknownReturns,
  noUnknownTypeAliases,
  noWidenThenAssert,
} from "./type-evidence-rules.ts";

export default definePlugin({
  meta: { name: "liminal" },
  rules: {
    "contract-imports": contractImports,
    "contract-no-side-effects": contractNoSideEffects,
    "entry-isolation": entryIsolation,
    "plugin-imports": pluginImports,
    "view-imports": viewImports,
    "no-unknown-parameters": noUnknownParameters,
    "no-unknown-returns": noUnknownReturns,
    "no-unknown-type-aliases": noUnknownTypeAliases,
    "no-object-parameters": noObjectParameters,
    "no-loose-dictionaries": noLooseDictionaries,
    "no-chained-assertions": noChainedAssertions,
    "assertion-needs-reason": assertionNeedsReason,
    "no-widen-then-assert": noWidenThenAssert,
    "no-runtime-typeof": noRuntimeTypeof,
    "no-narration-comments": noNarrationComments,
    "no-placeholder-comments": noPlaceholderComments,
    "no-divider-comments": noDividerComments,
    "no-commented-code": noCommentedCode,
    "no-jargon": noJargon,
    "no-em-dash": noEmDash,
    "max-comment-words": maxCommentWords,
    "prefer-jsdoc": preferJsDoc,
    "disable-needs-reason": disableNeedsReason,
    "no-filter-map": noFilterMap,
    "no-conditional-empty-spread": noConditionalEmptySpread,
    "no-module-mocking": noModuleMocking,
    "no-reflect": noReflect,
    "padding-lines": paddingLines,
    "no-manual-tag-check": noManualTagCheck,
    "no-manual-tagged-object": noManualTaggedObject,
    "no-effect-run": noEffectRun,
  },
});
