import { noEffectRun, noManualTagCheck, noManualTaggedObject } from "./effect-rules.ts";
import { testRule } from "./rule-tester.ts";

const file = "packages/kernel/src/example.ts";

testRule("no-manual-tag-check", noManualTagCheck, {
  valid: [{ filename: file, code: "const tag = error._tag;" }],
  invalid: [
    { filename: file, code: "if (error._tag === 'NotFound') {}", errors: 1 },
    { filename: file, code: "switch (event._tag) { default: break; }", errors: 1 },
  ],
});

testRule("no-manual-tagged-object", noManualTaggedObject, {
  valid: [
    { filename: file, code: "const a = new NotFound({ id });" },
    { filename: file, code: "Match.when({ _tag: 'A' }, handle);" },
  ],
  invalid: [
    { filename: file, code: "const a = { _tag: 'NotFound', id };", errors: 1 },
    { filename: file, code: "const a = { '_tag': 'NotFound' };", errors: 1 },
  ],
});

testRule("no-effect-run", noEffectRun, {
  valid: [{ filename: file, code: "const program = Effect.map(task, f);" }],
  invalid: [
    { filename: file, code: "Effect.runPromise(program);", errors: 1 },
    { filename: file, code: "BunRuntime.runMain(program);", errors: 1 },
  ],
});
