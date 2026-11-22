// Stand-in for upstream's preview port scanner, reduced to the two calls the Codex adapter makes.
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";

export class PortDiscovery extends Context.Service<
  PortDiscovery,
  {
    /** Counts a running agent until the returned function is called. */
    readonly trackAgent: () => () => void;
    /** Tells the adapter which of its commands a user stop is about to signal. */
    readonly watchAgentCommandStops: (
      watcher: AgentCommandStopWatcher,
    ) => Effect.Effect<void, never, Scope.Scope>;
  }
>()("t3/preview/PortScanner/PortDiscovery") {}

/** Agents launch with this set to their thread, so commands they start stay attributed. */
export const AGENT_THREAD_ENV = "T3CODE_THREAD_ID";

export interface AgentCommandStopWatcher {
  readonly variable: string;
  readonly onStop: (command: string) => Effect.Effect<void>;
  readonly onStopAbandoned: (command: string) => Effect.Effect<void>;
}

/** A scanner that tracks nothing. Use it unless you also build T3-style local server previews. */
export const layerTest = Layer.mock(PortDiscovery)({
  trackAgent: () => () => undefined,
  watchAgentCommandStops: () => Effect.void,
});
