/** The folders Liminal reads and writes, supplied by the host to every plugin. */

import { Context } from "effect";

export class Directories extends Context.Service<
  Directories,
  {
    /** User-wide settings and plugins, shared by every project. */
    readonly global: string;
    /** Settings and plugins of the project Liminal runs in. */
    readonly project: string;
    /** Durable state such as the session database. */
    readonly data: string;
  }
>()("liminal/sdk/Directories") {}
