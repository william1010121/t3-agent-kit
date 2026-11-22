// Replays a real recorded `codex app-server` session through the Codex adapter: the transcript
// checks every frame the adapter sends and feeds back the frames Codex sent.
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  CodexSettings,
  MessageId,
  NodeId,
  ProjectId,
  ProviderSessionId,
  RunAttemptId,
  RunId,
  ThreadId,
  type ModelSelection,
} from "@t3-agent-kit/contracts";
import * as IdAllocator from "@t3-agent-kit/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3-agent-kit/provider-core/server/McpProviderSessions";
import * as ProviderAdapter from "@t3-agent-kit/provider-core/server/ProviderAdapter";
import {
  decodeProviderReplayNdjson,
  materializeReplayTranscriptWorkspace,
} from "@t3-agent-kit/provider-testing/replayTranscript";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexReplay from "effect-codex-app-server/replay";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Digest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as CodexAdapterV2 from "./orchestration-v2/Adapters/CodexAdapterV2.ts";

const fixture = new URL(
  "./orchestration-v2/testkit/fixtures/simple/codex_transcript.ndjson",
  import.meta.url,
);

const DEFAULT_CODEX_SETTINGS = Schema.decodeSync(CodexSettings)({});

it.live("replays a recorded Codex turn through the adapter", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "t3-agent-kit-codex-replay-" });
    const attachmentsDir = path.join(workspace, ".attachments");
    yield* fs.makeDirectory(attachmentsDir);

    const recorded = yield* decodeProviderReplayNdjson(yield* fs.readFileString(fixture.pathname));
    const transcript = yield* Schema.decodeUnknownEffect(CodexReplay.CodexAppServerReplayTranscript)(
      materializeReplayTranscriptWorkspace(recorded, workspace),
    );
    const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
      Effect.provide(yield* Layer.build(CodexReplay.layerReplay(transcript))),
    );

    const modelSelection = {
      instanceId: CodexAdapterV2.CODEX_DEFAULT_INSTANCE_ID,
      model: "gpt-6-luna",
    } satisfies ModelSelection;
    const runtimePolicy = ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
      runtimeMode: "full-access",
      interactionMode: "default",
      cwd: workspace,
    });

    const adapter = yield* CodexAdapterV2.makeCodexAdapterV2({
      instanceId: CodexAdapterV2.CODEX_DEFAULT_INSTANCE_ID,
      settings: DEFAULT_CODEX_SETTINGS,
      environment: {},
      clientFactory: { open: () => Effect.succeed(client) },
      digest: yield* Digest.Digest,
      fileSystem: fs,
      idAllocator: yield* IdAllocator.IdAllocatorV2,
      serverConfig: { attachmentsDir },
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
    const attemptId = RunAttemptId.make("attempt-simple");
    yield* runtime.startTurn({
      appThread: {
        createdBy: "user",
        creationSource: "web",
        id: threadId,
        projectId: ProjectId.make("project-simple"),
        title: "Replay fixture: simple",
        providerInstanceId: CodexAdapterV2.CODEX_DEFAULT_INSTANCE_ID,
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
      attemptId,
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
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(IdAllocator.layer, McpProviderSessions.layer, NodeServices.layer, NodeCrypto.layer),
    ),
  ),
);
