/** Runs oxlint rule cases under `node --test`; oxlint's RuleTester refuses to run under Bun. */
import { describe, it } from "node:test";

import type { Rule } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";

RuleTester.describe = (text, fn) => {
  void describe(text, fn);
};

RuleTester.it = (text, fn) => {
  void it(text, fn);
};

type Cases = Parameters<RuleTester["run"]>[2];

export const testRule = (name: string, rule: Rule, cases: Cases) => {
  new RuleTester().run(name, rule, cases);
};
