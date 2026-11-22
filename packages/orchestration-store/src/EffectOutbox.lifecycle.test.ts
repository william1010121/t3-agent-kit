// Drives the durable effect outbox on the real migrated schema: an enqueued effect is claimed
// under a lease, retried, claimed again and settled.
import { assert, it } from "@effect/vitest";
import { CommandId, ThreadId } from "@t3-agent-kit/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as EffectOutbox from "./orchestration-v2/EffectOutbox.ts";
import * as SqlitePersistence from "./persistence/Sqlite.ts";

const layer = EffectOutbox.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory));

it.effect("claims, retries and settles an enqueued effect", () =>
  Effect.gen(function* () {
    const outbox = yield* EffectOutbox.EffectOutboxV2;
    const commandId = CommandId.make("command-1");
    yield* outbox.enqueue([
      {
        id: "effect-1",
        commandId,
        threadId: ThreadId.make("thread-1"),
        request: { type: "provider-session.apply-thread-title", title: "Hello" },
      },
    ]);

    const claimed = yield* outbox.claimNext({ workerId: "worker-a" });
    assert.strictEqual(Option.getOrThrow(claimed).id, "effect-1");
    assert.isTrue(Option.isNone(yield* outbox.claimNext({ workerId: "worker-b" })));

    assert.isTrue(
      yield* outbox.retry({ effectId: "effect-1", workerId: "worker-a", error: "busy", delayMs: 0 }),
    );
    const reclaimed = Option.getOrThrow(yield* outbox.claimNext({ workerId: "worker-b" }));
    assert.strictEqual(reclaimed.attemptCount, 2);
    assert.isFalse(yield* outbox.succeed({ effectId: "effect-1", workerId: "worker-a" }));
    assert.isTrue(yield* outbox.succeed({ effectId: "effect-1", workerId: "worker-b" }));

    const [settled] = yield* outbox.listByCommandId(commandId);
    assert.strictEqual(settled?.status, "succeeded");
  }).pipe(Effect.provide(layer)),
);
