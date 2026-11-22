// Stand-in for upstream's adapter registry, without its provider-instance (settings-driven) layer.
import type { ProviderInstanceId } from "@t3-agent-kit/contracts";
import type * as ProviderAdapter from "@t3-agent-kit/provider-core/server/ProviderAdapter";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

export class ProviderAdapterRegistryLookupError extends Schema.TaggedError<ProviderAdapterRegistryLookupError>()(
  "ProviderAdapterRegistryLookupError",
  { instanceId: Schema.String },
) {
  override get message() {
    return `No provider adapter registered for instance '${this.instanceId}'.`;
  }
}

export interface ProviderAdapterRegistryV2Shape {
  readonly get: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderAdapter.ProviderAdapterV2["Service"], ProviderAdapterRegistryLookupError>;
  readonly list: () => Effect.Effect<ReadonlyArray<ProviderInstanceId>>;
}

export class ProviderAdapterRegistryV2 extends Context.Service<
  ProviderAdapterRegistryV2,
  ProviderAdapterRegistryV2Shape
>()("t3/orchestration-v2/ProviderAdapterRegistry/ProviderAdapterRegistryV2") {}

function makeRegistry(
  adapters: ReadonlyArray<ProviderAdapter.ProviderAdapterV2["Service"]>,
): ProviderAdapterRegistryV2Shape {
  return {
    get: (instanceId) => {
      const adapter = adapters.find((candidate) => candidate.instanceId === instanceId);
      return adapter === undefined
        ? Effect.fail(new ProviderAdapterRegistryLookupError({ instanceId }))
        : Effect.succeed(adapter);
    },
    list: () => Effect.succeed(adapters.map((adapter) => adapter.instanceId)),
  };
}

export function layerFromAdapters(
  adapters: ReadonlyArray<ProviderAdapter.ProviderAdapterV2["Service"]>,
): Layer.Layer<ProviderAdapterRegistryV2> {
  return Layer.succeed(ProviderAdapterRegistryV2, makeRegistry(adapters));
}

export function layerFromAdaptersEffect<R, E>(
  adapters: Effect.Effect<ReadonlyArray<ProviderAdapter.ProviderAdapterV2["Service"]>, E, R>,
): Layer.Layer<ProviderAdapterRegistryV2, E, Exclude<R, Scope.Scope>> {
  return Layer.effect(ProviderAdapterRegistryV2, Effect.map(adapters, makeRegistry));
}

export function layerSingle(
  adapter: ProviderAdapter.ProviderAdapterV2["Service"],
): Layer.Layer<ProviderAdapterRegistryV2> {
  return layerFromAdapters([adapter]);
}
