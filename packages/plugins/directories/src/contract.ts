/** The folders Liminal reads and writes. */
import { Context } from "effect";

export class Directories extends Context.Service<
  Directories,
  {
    /** User-wide files shared by every project: `~/.liminal`. */
    readonly global: string;
    /** The folder Liminal works in; relative paths resolve against it. */
    readonly workspace: string;
    /** The project's own files: `<workspace>/.liminal`. */
    readonly project: string;
  }
>()("directories/Directories") {}
