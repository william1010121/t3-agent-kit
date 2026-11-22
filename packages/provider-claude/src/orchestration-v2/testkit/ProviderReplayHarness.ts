// Stand-in for upstream's orchestrator replay harness: only the parts a provider testkit builds on.
import type { ProviderDriverKind, ProviderReplayTranscript } from "@t3-agent-kit/contracts";
import type * as McpProviderSessions from "@t3-agent-kit/provider-core/server/McpProviderSessions";
import type { ProviderReplayGate } from "@t3-agent-kit/provider-testing/replayGate";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import type * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import type * as Scope from "effect/Scope";

import type * as ServerConfig from "../../config.ts";
import type * as ProviderAdapterRegistry from "../ProviderAdapterRegistry.ts";

export function makeReplayServerConfig(
  scenario: string,
): Effect.Effect<
  ServerConfig.ServerConfig["Service"],
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> {
  const safeScenario = scenario.replace(/[^a-z0-9_-]+/gi, "-");
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = yield* fs.makeTempDirectoryScoped({
      prefix: `t3-agent-kit-replay-${safeScenario}-`,
    });
    const stateDir = path.join(baseDir, "userdata");
    const attachmentsDir = path.join(stateDir, "attachments");
    yield* fs.makeDirectory(attachmentsDir, { recursive: true });
    return { attachmentsDir, stateDir };
  });
}

export interface OrchestratorV2ProviderReplayHarness<
  Transcript extends ProviderReplayTranscript = ProviderReplayTranscript,
  Error = never,
> {
  readonly driver: ProviderDriverKind;
  readonly decodeTranscript: (
    transcript: ProviderReplayTranscript,
  ) => Effect.Effect<Transcript, Error>;
  readonly makeProviderAdapterRegistryLayer: (
    transcript: Transcript,
    options?: { readonly replayGate?: ProviderReplayGate },
  ) => Layer.Layer<
    ProviderAdapterRegistry.ProviderAdapterRegistryV2,
    Error,
    McpProviderSessions.McpProviderSessions
  >;
}
