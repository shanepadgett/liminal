/** Trust's server: the workspace's trust, read and written through the `ProjectTrust` base service. */

import { Effect } from "effect";

import { Directories, ProjectTrust } from "@liminal/sdk";

import { TrustRpcs } from "./contract.ts";

export const layer = TrustRpcs.toLayer(
  Effect.gen(function* () {
    const trust = yield* ProjectTrust;
    const { workspace } = yield* Directories;

    return TrustRpcs.of({
      "trust/workspace": () => Effect.map(trust.trusted, (trusted) => ({ workspace, trusted })),
      "trust/trust": () => trust.trust,
    });
  }),
);
