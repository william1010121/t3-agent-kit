# T3 Code's orchestrator: a reference

T3 Code's `Orchestrator.ts` (17,293 lines) and effect worker (`EffectWorker.ts`, 1,127 lines) are not
extracted into a package. This page explains how they work, which parts this kit already gives you,
and what you have to write yourself to build the same thing.

All links point at the upstream commit pinned in [`upstream.json`](../upstream.json):
[`c198f73`](https://github.com/pingdotgg/t3code/tree/c198f73b3766090e02cace1a8b14f439f9fc63b6/apps/server/src/orchestration-v2).

## Why it is not a package

- **Size of its dependencies.** The orchestrator and the worker need about 225 more T3 server files
  behind their services: run execution, provider sessions, turn start and control, checkpoint
  capture and rollback, server settings.
- **No tests would come along.** Every upstream orchestrator test starts the real services. Even the
  smallest, `Orchestrator.migration.test.ts`, needs those same files. A copy would be 17k lines
  tested only by new tests against fake services.
- **Its services are the product.** A slimmer copy would leave you to write the run loop, the
  provider session manager, checkpointing and runtime policy. Those are most of what makes T3 Code
  work, and they are tied to T3's settings, workspace and provider registry.

The pieces that stand on their own are extracted. They are listed under
[What the kit already gives you](#what-the-kit-already-gives-you).

## The flow

```
client command
  -> Orchestrator.dispatch
       1. take the thread lock (ThreadCommandExecutor)
       2. replay the stored result if the command ID has a receipt (CommandReceiptStore)
       3. decide: read the projection, check policy, build a plan of events + effects
       4. commit events and pending effects in one transaction (EventSink.writeWithEffects)
       5. apply the events to the projection, then publish to subscribers
  -> effect worker (separate fiber)
       6. claim the next effect with a lease (EffectOutbox.claimNext)
       7. run it against a provider or the workspace (OrchestrationEffectExecutorV2)
       8. mark it settled (succeed / retry / fail)
  -> provider events come back through EventSink.consumeProviderEvents
     and become more events on the same thread
```

The rule behind this: **external I/O happens only after the intent is persisted.** The decision in
step 3 never calls a provider. It writes an effect row, and the worker performs it after the
transaction commits. If the process dies, the outbox still has the effect, and
`reconcileAfterProcessLoss` requeues or cancels it on restart.

### Dispatch details worth copying

- **Idempotency.** Every command carries a `commandId`. A repeated command returns the original
  result (`replayed: true`) instead of running again. A command that decides nothing still records a
  receipt, so a replayed Stop finds it rather than stopping work that started since.
- **Lock order.** Upstream picks locks before dispatch
  ([`dispatchWithReceipt`](https://github.com/pingdotgg/t3code/blob/c198f73b3766090e02cace1a8b14f439f9fc63b6/apps/server/src/orchestration-v2/Orchestrator.ts#L16447)):
  - a fork also holds its source thread's lock;
  - delete, archive and unarchive lock the thread and then its side chats, and deletion takes a
    global deletion lock first (`withDeletionLock`);
  - messages to one thread queue behind a per-thread intake lock, so they keep their order.
- **Plans, not calls.** Each command handler returns `{ events, effects }`. Handlers are pure enough
  to test by reducing the events over a projection, as upstream's `ThreadDeletion.test.ts` does with
  `applyToProjection`.

## The effect worker

The outbox defines 17 effect types. The worker's executor switches on `request.type` and calls one
upstream service for each:

| Effect | What it does | Upstream service |
|---|---|---|
| `provider-turn.start` | Start a turn on the provider | `ProviderTurnStartService` |
| `provider-turn.interrupt` | Stop a running turn and its subagents | `ProviderTurnControlService` |
| `provider-turn.steer` | Send a steering message into a running turn | `ProviderTurnControlService` |
| `provider-turn.restart` | Restart a turn, replacing or detaching the session | `ProviderTurnControlService` |
| `provider-runtime.continue` | Continue a run after a restart or provider process exit | `RestartContinuation` |
| `provider-session.detach` | Release a provider session | `ProviderSessionManager` |
| `provider-session.apply-model-selection` | Switch model on a live session | `ProviderTurnControlService` |
| `provider-session.apply-thread-title` | Push a thread title to the provider | `ProviderTurnControlService` |
| `provider-thread.rollback` | Roll the provider's thread back to a checkpoint | `CheckpointRollbackService` |
| `runtime-request.respond` | Answer an approval or question | `RuntimeRequestService` |
| `checkpoint.capture` | Finalize a run, capturing its workspace checkpoint | `RunFinalizationService` (checkpoints: [`@t3-agent-kit/checkpoint`](../packages/checkpoint)) |
| `thread-title.generate` | Generate or regenerate a thread title | `ThreadTitleRegenerationService` |
| `delegated-tasks.stop` | Stop a thread's delegated child tasks | `ThreadManagementService` |
| `terminal.cleanup`, `preview.cleanup`, `attachment.cleanup`, `scheduled-tasks.cleanup` | Release per-thread resources on archive or delete | `ResourceCleanupService` |

Worker behavior to keep if you write your own:

- **Leases.** `claimNext({ workerId })` gives one worker the effect. `succeed` returns `false` if the
  worker lost the lease; the result is then dropped, not applied.
- **Cancellation.** After claiming, the worker registers for cancellation and then rereads the
  effect's stored status. A cancel that landed during the claim is caught there, so the effect never
  runs. While it runs, execution races `awaitCancellation`.
- **Stuck work.** A running effect blocks later effects on its thread. A Stop that hangs gives up
  after a timeout and falls through to the normal retry or fail path.
- **Process loss.** Effects bound to a dead process are terminalized instead of retried.
- **Tests.** Drain the worker (`OrchestrationEffectWorkerV2.drain`) instead of sleeping.

## What the kit already gives you

| Orchestrator dependency | In the kit |
|---|---|
| Event store, projections, publishing (`EventSinkV2`, `ProjectionStoreV2`) | `@t3-agent-kit/orchestration-store/EventSink`, `/ProjectionStore` |
| Command receipts (`CommandReceiptStoreV2`) | `@t3-agent-kit/orchestration-store/CommandReceiptStore` |
| Durable effect outbox (`EffectOutboxV2`) | `@t3-agent-kit/orchestration-store/EffectOutbox` |
| Per-thread locks (`ThreadCommandExecutor`) | `@t3-agent-kit/orchestration-store/ThreadCommandExecutor` |
| Fork planning (`ThreadForkServiceV2`) | `@t3-agent-kit/orchestration-store/ThreadForkService` |
| Steering and fork policy from capabilities (`CommandPolicyV2`) | `@t3-agent-kit/orchestration-store/CommandPolicy` |
| Queued run order, runtime-mode ceilings, deletion, guest sharing, restore safety | `/QueuedRunOrder`, `/DispatchModeLimit`, `/ThreadDeletion`, `/GuestShareDecider`, `/CheckpointRestoreSafety` |
| Database and migrations | `@t3-agent-kit/orchestration-store/persistence/Sqlite`, `/persistence/Migrations` |
| Project commands as a worked decider | `@t3-agent-kit/orchestration-store/ProjectCommands`, `/ProjectStore` |
| Provider adapters and their event stream | `@t3-agent-kit/provider-core`, `provider-codex`, `provider-claude`, `provider-acp` |
| Workspace checkpoints | `@t3-agent-kit/checkpoint` |

## What you write yourself

These are the main upstream services the orchestrator and worker reach through their service
interfaces. Line counts are for the upstream file alone, not what it imports.

| Service | Lines | What yours needs to do |
|---|---|---|
| `ProviderSessionManager` | 3,629 | Open, reuse and close one provider session per thread |
| `RunExecutionService` | 2,440 | Drive a run from queued to settled |
| `ProviderTurnStartService` | 2,392 | Build turn input and start it on the adapter |
| `ThreadManagementService` | 1,930 | Thread lifecycle work run by effects |
| `CheckpointService` | 1,190 | Capture checkpoints per turn (wrap `@t3-agent-kit/checkpoint`) |
| `ContextHandoffService` | 622 | Carry context into forks and merge-backs |
| `CheckpointRollbackService` | 572 | Restore a checkpoint and roll the provider back |
| `ProviderTurnControlService` | 533 | Interrupt, steer and restart turns |
| `RuntimePolicy` | 244 | Ceiling on what runtime modes a thread may use |
| `ProviderAdapterRegistry` | 218 | Map provider instances to adapters |
| `ProviderSwitchService` | 196 | Move a thread to another provider or model |

## A smaller orchestrator from the kit

If you want T3's guarantees without its full feature set, the minimum is:

1. Wrap each command in `ThreadCommandExecutor.withLock(threadId, ...)`.
2. Return the stored result if `CommandReceiptStore.getByCommandId` finds one.
3. Read the thread from `ProjectionStore`, decide, and produce events plus pending effects.
4. Commit both with `EventSink.writeWithEffects({ commandId, events, effects })`.
5. Run a worker loop: `EffectOutbox.claimNext`, run the effect against your adapter, then
   `succeed`. Call `reconcileAfterProcessLoss` once at startup.
6. Feed adapter events back with `EventSink.consumeProviderEvents`.

`ProjectCommands` and `ProjectStore` in `orchestration-store` show steps 2 to 4 for the project
aggregate.
