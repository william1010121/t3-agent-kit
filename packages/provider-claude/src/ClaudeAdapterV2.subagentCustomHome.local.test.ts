// The SDK reads subagent transcripts from process.env.CLAUDE_CONFIG_DIR, so a lookup for an
// instance with its own Claude home must read that home, not the server's.
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProviderSessionId, ThreadId } from "@t3-agent-kit/contracts";
import * as ProviderEventLoggers from "@t3-agent-kit/provider-core/server/ProviderEventLoggers";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ClaudeAdapterV2 from "./orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import * as PortScanner from "./preview/PortScanner.ts";

const line = (value: unknown) => `${JSON.stringify(value)}\n`;

it.live("reads a subagent's model from the instance's custom Claude home", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: "claude-home-" });
    const cwd = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "claude-cwd-" }));
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const project = path.join(home, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
    yield* fs.makeDirectory(path.join(project, sessionId, "subagents"), { recursive: true });
    yield* fs.writeFileString(
      path.join(project, `${sessionId}.jsonl`),
      line({
        type: "user",
        uuid: "22222222-2222-4222-8222-222222222222",
        parentUuid: null,
        sessionId,
        cwd,
        message: { role: "user", content: "hi" },
      }),
    );
    yield* fs.writeFileString(
      path.join(project, sessionId, "subagents", "agent-abc.jsonl"),
      line({
        type: "user",
        uuid: "33333333-3333-4333-8333-333333333333",
        parentUuid: null,
        sessionId,
        isSidechain: true,
        agentId: "abc",
        message: { role: "user", content: "task" },
      }) +
        line({
          type: "assistant",
          uuid: "44444444-4444-4444-8444-444444444444",
          parentUuid: "33333333-3333-4333-8333-333333333333",
          sessionId,
          isSidechain: true,
          agentId: "abc",
          message: {
            role: "assistant",
            model: "claude-haiku-4-5",
            content: [{ type: "text", text: "ok" }],
          },
        }),
    );

    const runner = yield* ClaudeAdapterV2.ClaudeAgentSdkQueryRunner;
    const model = yield* runner.subagentModel({
      sessionId,
      agentId: "abc",
      dir: cwd,
      environment: { ...process.env, CLAUDE_CONFIG_DIR: home },
      threadId: ThreadId.make("thread-custom-home"),
      providerSessionId: ProviderSessionId.make("session-custom-home"),
    });
    assert.strictEqual(model, "claude-haiku-4-5");
  }).pipe(
    Effect.scoped,
    Effect.provide(
      ClaudeAdapterV2.layerQueryRunner.pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeServices.layer,
            NodeCrypto.layer,
            PortScanner.layerTest,
            Layer.succeed(
              ProviderEventLoggers.ProviderEventLoggers,
              ProviderEventLoggers.NoOpProviderEventLoggers,
            ),
          ),
        ),
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  ),
);
