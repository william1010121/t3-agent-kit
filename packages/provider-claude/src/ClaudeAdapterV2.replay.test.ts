// Replays a real recorded Claude Agent SDK session through the Claude adapter: the transcript
// checks every query the adapter opens and prompt it offers, and feeds back what the SDK streamed.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  MessageId,
  NodeId,
  ProjectId,
  ProviderSessionId,
  RunAttemptId,
  RunId,
  ThreadId,
  type ModelSelection,
} from "@t3-agent-kit/contracts";
import * as McpProviderSessions from "@t3-agent-kit/provider-core/server/McpProviderSessions";
import * as ProviderAdapter from "@t3-agent-kit/provider-core/server/ProviderAdapter";
import {
  decodeProviderReplayNdjson,
  materializeReplayTranscriptWorkspace,
} from "@t3-agent-kit/provider-testing/replayTranscript";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ClaudeAdapterV2 from "./orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import { ClaudeOrchestratorReplayHarness } from "./orchestration-v2/Adapters/ClaudeAdapterV2.testkit.ts";
import * as ProviderAdapterRegistry from "./orchestration-v2/ProviderAdapterRegistry.ts";

const fixture = new URL(
  "./orchestration-v2/testkit/fixtures/simple/claude_transcript.ndjson",
  import.meta.url,
);

it.live("replays a recorded Claude turn through the adapter", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "t3-agent-kit-claude-replay-" });
    const recorded = yield* decodeProviderReplayNdjson(yield* fs.readFileString(fixture.pathname));
    const transcript = yield* ClaudeOrchestratorReplayHarness.decodeTranscript(
      materializeReplayTranscriptWorkspace(recorded, workspace),
    );
    const registry = yield* Effect.service(ProviderAdapterRegistry.ProviderAdapterRegistryV2).pipe(
      Effect.provide(
        yield* Layer.build(ClaudeOrchestratorReplayHarness.makeProviderAdapterRegistryLayer(transcript)),
      ),
    );
    const adapter = yield* registry.get(ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID);

    const modelSelection = {
      instanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
      model: "claude-sonnet-4-6",
    } satisfies ModelSelection;
    const runtimePolicy = ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
      runtimeMode: "full-access",
      interactionMode: "default",
      cwd: workspace,
    });

    const threadId = ThreadId.make("thread-simple");
    const runtime = yield* adapter.openSession({
      threadId,
      providerSessionId: ProviderSessionId.make("session-simple"),
      modelSelection,
      runtimePolicy,
    });
    const events: Array<ProviderAdapter.ProviderAdapterV2Event> = [];
    const terminal = yield* Deferred.make<void>();
    yield* runtime.events.pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => events.push(event)).pipe(
          Effect.andThen(
            event.type === "turn.terminal" ? Deferred.succeed(terminal, undefined) : Effect.void,
          ),
        ),
      ),
      Effect.forkScoped,
    );

    const providerThread = yield* runtime.ensureThread({ threadId, modelSelection, runtimePolicy });
    const now = yield* DateTime.now;
    yield* runtime.startTurn({
      appThread: {
        createdBy: "user",
        creationSource: "web",
        id: threadId,
        projectId: ProjectId.make("project-simple"),
        title: "Replay fixture: simple",
        providerInstanceId: ClaudeAdapterV2.CLAUDE_DEFAULT_INSTANCE_ID,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        activeProviderThreadId: providerThread.id,
        lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
        forkedFrom: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        lastVisitedAt: null,
        deletedAt: null,
      },
      threadId,
      runId: RunId.make("run-simple"),
      runOrdinal: 1,
      providerTurnOrdinal: 1,
      attemptId: RunAttemptId.make("attempt-simple"),
      rootNodeId: NodeId.make("node-simple"),
      providerThread,
      message: {
        createdBy: "user",
        creationSource: "web",
        messageId: MessageId.make("message-simple"),
        text: "Respond with the following text: fixture simple ok",
        attachments: [],
      },
      modelSelection,
      runtimePolicy,
    });
    yield* Deferred.await(terminal);

    const terminalEvent = events.find((event) => event.type === "turn.terminal");
    assert.strictEqual(terminalEvent?.type === "turn.terminal" && terminalEvent.status, "completed");
    assert.include(JSON.stringify(events), "fixture simple ok");
  }).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(McpProviderSessions.layer, NodeServices.layer))),
);
