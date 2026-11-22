// @effect-diagnostics nodeBuiltinImport:off
import { execFileSync } from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { CheckpointRef } from "@t3-agent-kit/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import { CheckpointStore, layer } from "../index.ts";

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.test",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.test",
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env, stdio: "pipe" }).toString().trim();
const checkpointRef = CheckpointRef.make("refs/t3/checkpoints/local/turn/0");

const layerTest = layer.pipe(Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)));

it.layer(layerTest)("CheckpointStore deleteCheckpointRefs", (it) => {
  it.effect("fails when a checkpoint ref cannot be deleted", () =>
    Effect.gen(function* () {
      const store = yield* CheckpointStore;
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "checkpoint-delete-"));
      git(root, "init", "-q");
      NodeFS.writeFileSync(NodePath.join(root, "a.txt"), "a\n");
      git(root, "add", "a.txt");
      git(root, "commit", "-qm", "root");
      yield* store.captureCheckpoint({ cwd: root, checkpointRef });
      // A held ref lock (another git process) makes `update-ref -d` exit nonzero.
      NodeFS.writeFileSync(NodePath.join(root, ".git", `${checkpointRef}.lock`), "");
      const exit = yield* Effect.exit(store.deleteCheckpointRefs({ cwd: root, checkpointRefs: [checkpointRef] }));
      assert.isTrue(Exit.isFailure(exit));
      assert.notStrictEqual(git(root, "rev-parse", "--verify", "--quiet", checkpointRef), "");
    }),
  );
});
