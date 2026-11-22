// Replays a real recorded `codex app-server` session, with a native subagent added, through the
// Codex adapter.
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

const ROOT_THREAD = "01a0d5eb-f0c0-7481-a417-5e8871805cbc";
const CHILD_THREAD = "native-child-thread";
const CHILD_TURN = "native-child-turn";
const childTurn = (status: string) => ({
  id: CHILD_TURN,
  items: [],
  itemsView: "notLoaded",
  status,
  error: null,
  startedAt: 1790295405,
  completedAt: null,
  durationMs: null,
});

// The root spawns a native subagent that is still running when the root's turn completes; Stop
// afterwards must interrupt that child.
const withRunningChild = <T extends { readonly entries: ReadonlyArray<unknown> }>(transcript: T): T => ({
  ...transcript,
  entries: transcript.entries.flatMap((entry: any) => {
    if (entry.type === "emit_inbound" && entry.frame?.method === "item/completed" && entry.frame.params?.item?.type === "userMessage")
      return [
        entry,
        {
          type: "emit_inbound",
          frame: {
            method: "item/completed",
            params: {
              item: {
                type: "subAgentActivity",
                id: "call-spawn-child",
                kind: "started",
                agentThreadId: CHILD_THREAD,
                agentPath: "/root/child_agent",
              },
              threadId: ROOT_THREAD,
              turnId: entry.frame.params.turnId,
              completedAtMs: 1790295405000,
            },
          },
        },
        {
          type: "emit_inbound",
          frame: { method: "turn/started", params: { threadId: CHILD_THREAD, turn: childTurn("inProgress") } },
        },
      ];
    if (entry.type === "runtime_exit")
      return [
        {
          type: "expect_outbound",
          frame: { id: 7, method: "turn/interrupt", params: { threadId: CHILD_THREAD, turnId: CHILD_TURN } },
        },
        { type: "emit_inbound", frame: { id: 7, result: {} } },
        {
          type: "emit_inbound",
          frame: { method: "turn/completed", params: { threadId: CHILD_THREAD, turn: childTurn("interrupted") } },
        },
        entry,
      ];
    return [entry];
  }),
});

const DEFAULT_CODEX_SETTINGS = Schema.decodeSync(CodexSettings)({});

it.live("Stop after the root completes interrupts its still-running native subagent", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "t3-agent-kit-codex-replay-" });
    const attachmentsDir = path.join(workspace, ".attachments");
    yield* fs.makeDirectory(attachmentsDir);

    const recorded = yield* decodeProviderReplayNdjson(yield* fs.readFileString(fixture.pathname));
    const transcript = yield* Schema.decodeUnknownEffect(CodexReplay.CodexAppServerReplayTranscript)(
      withRunningChild(materializeReplayTranscriptWorkspace(recorded, workspace)),
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

    const providerTurnId = events.find(
      (event): event is Extract<ProviderAdapter.ProviderAdapterV2Event, { type: "provider_turn.updated" }> =>
        event.type === "provider_turn.updated" && event.providerTurn.nativeTurnRef?.nativeId !== CHILD_TURN,
    )?.providerTurn.id;
    assert.isDefined(providerTurnId);
    yield* runtime.interruptTurn({ providerThread, providerTurnId, requestRuntimeRestart: true });

    const childStatus = () =>
      events
        .filter(
          (event): event is Extract<ProviderAdapter.ProviderAdapterV2Event, { type: "provider_turn.updated" }> =>
            event.type === "provider_turn.updated" && event.providerTurn.nativeTurnRef?.nativeId === CHILD_TURN,
        )
        .at(-1)?.providerTurn.status;
    assert.equal(childStatus(), "interrupted");
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(IdAllocator.layer, McpProviderSessions.layer, NodeServices.layer, NodeCrypto.layer),
    ),
  ),
);
