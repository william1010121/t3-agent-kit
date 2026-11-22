// Stand-in for upstream's ServerConfig, reduced to the directories the Claude adapter reads.
import * as Context from "effect/Context";

export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly attachmentsDir: string;
    /** Holds provider process records and the model manifest cache. */
    readonly stateDir: string;
  }
>()("t3/config/ServerConfig") {}
