import { testRule } from "./rule-tester.ts";
import {
  noConditionalEmptySpread,
  noFilterMap,
  noModuleMocking,
  noReflect,
} from "./shape-rules.ts";

const file = "packages/kernel/src/example.ts";

testRule("no-filter-map", noFilterMap, {
  valid: [
    { filename: file, code: "items.flatMap((item) => (item.ok ? [item.id] : []));" },
    { filename: file, code: "items.map(toId).filter(Boolean);" },
  ],
  invalid: [
    { filename: file, code: "items.filter((item) => item.ok).map((item) => item.id);", errors: 1 },
    { filename: file, code: "items.filter(isOk).flatMap(expand);", errors: 1 },
  ],
});

testRule("no-conditional-empty-spread", noConditionalEmptySpread, {
  valid: [
    { filename: file, code: "const a = { ...base, id };" },
    { filename: file, code: "const a = [...(ok ? items : [])];" },
  ],
  invalid: [
    { filename: file, code: "const a = { ...(ok ? { id } : {}) };", errors: 1 },
    { filename: file, code: "const a = { ...(ok && { id }) };", errors: 1 },
  ],
});

testRule("no-module-mocking", noModuleMocking, {
  valid: [{ filename: file, code: "const layer = Layer.succeed(Clock, fakeClock);" }],
  invalid: [
    { filename: file, code: "mock.module('./clock.ts', () => ({}));", errors: 1 },
    { filename: file, code: "vi.mock('./clock.ts');", errors: 1 },
  ],
});

testRule("no-reflect", noReflect, {
  valid: [{ filename: file, code: "const a = target.name;" }],
  invalid: [{ filename: file, code: "const a = Reflect.get(target, 'name');", errors: 1 }],
});
