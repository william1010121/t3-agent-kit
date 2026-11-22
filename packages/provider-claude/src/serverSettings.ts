// Stand-in for upstream's settings service (file-backed, with managed policy and secrets).
// The Claude adapter reads it only when present, to pick up a changed idle-compaction setting.
import type { ServerSettings, ServerSettingsError } from "@t3-agent-kit/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export class ServerSettingsService extends Context.Service<
  ServerSettingsService,
  { readonly getSettings: Effect.Effect<ServerSettings, ServerSettingsError> }
>()("t3/serverSettings/ServerSettingsService") {}
