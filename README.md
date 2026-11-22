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
| [`@t3-agent-kit/provider-adapter`](packages/provider-adapter) | `ProviderAdapterV2`: the interface and normalized event stream every T3 Code provider implements | `packages/provider-core/src/server` |

## Roadmap

| Layer | Package | Status |
| --- | --- | --- |
| 2 | `replay`: record provider transcripts and replay them through adapters | Planned |
| 2 | `adapter-codex`, `adapter-claude`, `adapter-acp` | Planned |
| 3 | `orchestrator`: command → event → outbox | Planned |
| 3 | `client-runtime`: WebSocket connection, reconnect, thread sync | Planned |

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
