import { assert, it } from "@effect/vitest";
import {
  EventId,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2AppThread,
  type OrchestrationV2Subagent,
} from "@t3-agent-kit/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Sqlite from "../persistence/Sqlite.ts";
import * as EventSink from "./EventSink.ts";
import * as EventStore from "./EventStore.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

const layer = EventSink.layer.pipe(
  Layer.provideMerge(Layer.merge(EventStore.layer, ProjectionStore.layer)),
  Layer.provide(Sqlite.layerMemory),
);

it.effect("commits a conditional write over a subagent whose omitted completionDelivery was kept", () =>
  Effect.gen(function* () {
    const sink = yield* EventSink.EventSinkV2;
    const now = yield* DateTime.now;
    const threadId = ThreadId.make("subagent-thread");
    const providerInstanceId = ProviderInstanceId.make("codex");
    const thread: OrchestrationV2AppThread = {
      id: threadId,
      projectId: ProjectId.make("project"),
      title: "Thread",
      createdBy: "user",
      creationSource: "web",
      providerInstanceId,
      modelSelection: { instanceId: providerInstanceId, model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
      settledOverride: null,
      settledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      lastVisitedAt: null,
    };
    const base: OrchestrationV2Subagent = {
      id: NodeId.make("subagent"),
      threadId,
      runId: null,
      parentNodeId: NodeId.make("parent"),
      origin: "app_owned",
      createdBy: "agent",
      driver: ProviderDriverKind.make("codex"),
      providerInstanceId,
      providerThreadId: null,
      childThreadId: null,
      nativeTaskRef: null,
      prompt: "Investigate",
      title: null,
      model: null,
      status: "running",
      result: null,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
    };
    const delivery = { state: "pending" as const, observedByRunId: null };
    const updated = (id: string, payload: OrchestrationV2Subagent) => ({
      id: EventId.make(id),
      type: "subagent.updated" as const,
      threadId,
      occurredAt: now,
      payload,
    });
    yield* sink.write({
      events: [
        { id: EventId.make("thread"), type: "thread.created", threadId, occurredAt: now, payload: thread },
        updated("with-delivery", { ...base, completionDelivery: delivery }),
        updated("without-delivery", { ...base, progress: "halfway" }),
      ],
    });

    const result = yield* sink.writeIfSubagentUnchanged({
      expected: { ...base, completionDelivery: delivery, progress: "halfway" },
      events: [updated("completed", { ...base, completionDelivery: delivery, status: "completed" })],
    });
    assert.isTrue(result.committed);
  }).pipe(Effect.provide(layer)),
);
