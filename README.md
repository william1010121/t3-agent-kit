# t3-agent-kit

Reusable packages extracted from [T3 Code](https://github.com/pingdotgg/t3code), the open-source
control plane for coding agents. Use them to build your own agent, GUI, or orchestrator without
rebuilding the parts T3 Code already got right.

從 T3 Code 抽出最有價值的部分，做成可以單獨安裝的 package，讓想做 T3 Code 類似產品的人不用重新造輪子。

The packages stay on [Effect](https://effect.website) and keep upstream's source layout, so they can
be re-synced from T3 Code with one command.

## Packages

| Package | What it gives you | Upstream source |
| --- | --- | --- |
| [`effect-acp`](packages/effect-acp) | Typed client and agent for the Agent Client Protocol (ACP), generated from the ACP schema | `packages/effect-acp` |
| [`effect-codex-app-server`](packages/effect-codex-app-server) | Typed client for `codex app-server`, generated from the Codex protocol, with replay support | `packages/effect-codex-app-server` |
| [`@t3-agent-kit/contracts`](packages/contracts) | T3 Code's wire schemas: orchestration v2 events, provider capabilities, model selection, RPC | `packages/contracts` |
| [`@t3-agent-kit/checkpoint`](packages/checkpoint) | `CheckpointStore`: snapshot a workspace into hidden git refs per turn, then diff, restore and attribute authored paths. Handles submodules, nested repos, sparse checkouts and untracked files | `apps/server/src/{checkpointing,vcs}` |
| [`@t3-agent-kit/shared`](packages/shared) | Upstream's shared utilities (Effect helpers, process, paths, markdown) that the provider packages build on | `packages/shared` |
| [`@t3-agent-kit/provider-core`](packages/provider-core) | `ProviderAdapterV2`: the interface and normalized event stream every T3 Code provider implements, plus the adapter driver, runtime-event helpers and settings schemas | `packages/provider-core` |
| [`@t3-agent-kit/provider-testing`](packages/provider-testing) | Provider-neutral replay: scripted transcripts of raw provider frames (`replayTranscript`), a gate for ordering frames (`replayGate`), temp workspaces, a fake CLI and a test provider host | `packages/provider-testing` |
| [`@t3-agent-kit/provider-acp`](packages/provider-acp) | ACP adapter: turns any Agent Client Protocol agent into a `ProviderAdapterV2`, including terminals, elicitation forms and an MCP-over-ACP bridge | `packages/provider-acp` |
| [`@t3-agent-kit/provider-codex`](packages/provider-codex) | Codex adapter: drives `codex app-server` and emits `ProviderAdapterV2` events (turns, tools, approvals, plans, subagents, rollback, fork). Includes a replay test against a real recorded Codex session | `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts` |
| [`@t3-agent-kit/provider-claude`](packages/provider-claude) | Claude adapter: drives the Claude Agent SDK and emits `ProviderAdapterV2` events. Its `./testkit` replays recorded SDK sessions and records new ones. Reopen the session when a thread's `cwd` changes: like T3 Code, the adapter keeps the live Claude process for a new `cwd` | `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts` |
| [`@t3-agent-kit/client-runtime`](packages/client-runtime) | Client side of T3's WebSocket layer: environment connections, reconnect and wakeups, typed RPC, relay. Thread state sync is not included yet | `packages/client-runtime/src/{connection,rpc,relay,environment}` |
| [`@t3-agent-kit/orchestration-store`](packages/orchestration-store) | Event-sourcing storage: SQLite event store, command receipts, durable effect outbox (lease, retry, cancel, recovery after process loss), and T3's full schema migrations. `persistence/Sqlite` opens and migrates a database | `apps/server/src/{orchestration-v2/{EventStore,EffectOutbox,CommandReceiptStore},persistence}` |

## Roadmap

| Layer | Package | Status |
| --- | --- | --- |
| 2 | `replay` (as `provider-testing`) and `adapter-acp` (as `provider-acp`) | Done |
| 2 | `adapter-codex` (as `provider-codex`) | Done |
| 2 | `adapter-claude` (as `provider-claude`) | Done |
| 3 | `orchestrator`: command → event → outbox | Storage done (`orchestration-store`); decider and effect worker still planned |
| 3 | `client-runtime`: WebSocket connection, reconnect, RPC, relay | Done (thread sync still planned) |

## Checkpoint example

```ts
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CheckpointStore, layer } from "@t3-agent-kit/checkpoint";
import { CheckpointRef } from "@t3-agent-kit/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const before = CheckpointRef.make("refs/t3/checkpoints/my-thread/turn/0");
const after = CheckpointRef.make("refs/t3/checkpoints/my-thread/turn/1");

const turn = Effect.gen(function* () {
  const store = yield* CheckpointStore;
  yield* store.captureCheckpoint({ cwd, checkpointRef: before });
  // ... the agent edits files ...
  yield* store.captureCheckpoint({ cwd, checkpointRef: after, previousCheckpointRef: before });
  const patch = yield* store.diffCheckpoints({
    cwd, fromCheckpointRef: before, toCheckpointRef: after, ignoreWhitespace: false,
  });
  yield* store.restoreCheckpoint({ cwd, checkpointRef: before }); // undo the turn
});

turn.pipe(
  Effect.provide(layer.pipe(Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)))),
  Effect.runPromise,
);
```

## Syncing from upstream

Vendored files are copied verbatim from the commit pinned in [`upstream.json`](upstream.json), with
only the import rewrites listed there. Where upstream code depends on parts of the T3 server that are
not extracted, the package has a small hand-written stand-in instead (for example
`packages/checkpoint/src/vcs/GitVcsDriverCore.ts` and `packages/checkpoint/src/_shims`). Do not edit them by hand; change `upstream.json` or the sync
script instead.

```sh
pnpm sync                          # re-copy from the pinned commit
pnpm sync --commit <sha|branch>    # move to a new upstream commit and update the pin
pnpm sync:check                    # fail if vendored files drift from the pin (runs in CI)
```

## Development

Requires Node 24 and pnpm 10.

```sh
pnpm install
pnpm typecheck
pnpm test
```

## License

MIT. Vendored code is copyright T3 Tools Inc.; see [LICENSE](LICENSE).
