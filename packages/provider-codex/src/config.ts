// Stand-in for upstream's ServerConfig. The Codex adapter reads only `attachmentsDir`.
import * as Context from "effect/Context";

export class ServerConfig extends Context.Service<
  ServerConfig,
  { readonly attachmentsDir: string }
>()("t3/config/ServerConfig") {}
