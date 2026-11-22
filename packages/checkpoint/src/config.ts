// Stand-in for upstream's server config. Checkpoint code reads none of it; tests still provide it.
import * as Layer from "effect/Layer";

export class ServerConfig {
  static readonly layerTest = (
    _cwd: string,
    _baseDirOrPrefix: string | { readonly prefix: string },
  ) => Layer.empty;
}
