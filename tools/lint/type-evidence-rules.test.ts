import { testRule } from "./rule-tester.ts";
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

const file = "kernel/src/example.ts";

testRule("no-unknown-parameters", noUnknownParameters, {
  valid: [
    { filename: file, code: "const f = (value: string) => value;" },
    { filename: file, code: "const wrap = (cause: unknown) => cause;" },
    { filename: file, code: "function isText(value: unknown): value is string { return true; }" },
  ],
  invalid: [
    { filename: file, code: "const f = (value: unknown) => value;", errors: 1 },
    { filename: file, code: "function f(value: string | unknown = 1) {}", errors: 1 },
    { filename: file, code: "interface Port { send(payload: unknown): void }", errors: 1 },
  ],
});

testRule("no-unknown-returns", noUnknownReturns, {
  valid: [{ filename: file, code: "const f = (): string => 'a';" }],
  invalid: [
    { filename: file, code: "function f(): unknown { return 1; }", errors: 1 },
    { filename: file, code: "const f = async (): Promise<unknown> => 1;", errors: 1 },
  ],
});

testRule("no-unknown-type-aliases", noUnknownTypeAliases, {
  valid: [{ filename: file, code: "type Payload = { readonly id: string };" }],
  invalid: [{ filename: file, code: "type Payload = unknown;", errors: 1 }],
});

testRule("no-object-parameters", noObjectParameters, {
  valid: [{ filename: file, code: "const f = (value: { id: string }) => value;" }],
  invalid: [{ filename: file, code: "const f = (value: object | null) => value;", errors: 1 }],
});

testRule("no-loose-dictionaries", noLooseDictionaries, {
  valid: [
    { filename: file, code: "type Counts = Record<string, number>;" },
    {
      filename: file,
      code: "function f<T extends Record<string, unknown>>(value: T) { return value; }",
    },
  ],
  invalid: [
    { filename: file, code: "type Bag = Record<string, unknown>;", errors: 1 },
    { filename: file, code: "type Bag = { [key: string]: any };", errors: 1 },
  ],
});

testRule("no-chained-assertions", noChainedAssertions, {
  valid: [
    { filename: file, code: "const a = value as string;" },
    { filename: file, code: "const a = [1] as const;" },
  ],
  invalid: [{ filename: file, code: "const a = value as unknown as string;", errors: 1 }],
});

testRule("assertion-needs-reason", assertionNeedsReason, {
  valid: [
    { filename: file, code: "const a = [1] as const;" },
    {
      filename: file,
      code: "// The parser only returns strings here.\nconst a = value as string;",
    },
    { filename: file, code: "const a = value as string; // checked by the caller" },
  ],
  invalid: [
    { filename: file, code: "const a = value as string;", errors: 1 },
    { filename: file, code: "// unrelated\n\nconst a = value as string;", errors: 1 },
  ],
});

testRule("no-widen-then-assert", noWidenThenAssert, {
  valid: [{ filename: file, code: "const a: string = 'x';\nconst b = a as 'x';" }],
  invalid: [{ filename: file, code: "const a: unknown = 'x';\nconst b = a as string;", errors: 1 }],
});

testRule("no-runtime-typeof", noRuntimeTypeof, {
  valid: [
    { filename: file, code: "if (typeof Bun === 'undefined') {}" },
    { filename: file, code: "type T = typeof value;" },
  ],
  invalid: [{ filename: file, code: "if (typeof value === 'string') {}", errors: 1 }],
});
