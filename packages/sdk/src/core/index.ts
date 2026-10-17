/** The root `@liminal/sdk` surface: what manifests, contracts and servers import. */
export { Directories } from "./directories.ts";

export {
  type BaseServices,
  definePlugin,
  type Plugin,
  type ServerModule,
  type Services,
  type ServiceTag,
  type ServiceTags,
} from "./plugin.ts";

export * as Registry from "./registry.ts";
