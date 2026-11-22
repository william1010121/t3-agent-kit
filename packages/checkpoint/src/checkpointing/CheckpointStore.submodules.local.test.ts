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
  execFileSync("git", ["-c", "protocol.file.allow=always", ...args], { cwd, env, stdio: "pipe" });
const read = (file: string) => NodeFS.readFileSync(file, "utf8").trim();
const checkpointRef = CheckpointRef.make("refs/t3/checkpoints/local/turn/0");

const repoWithSubmodule = () => {
  const base = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "checkpoint-submodule-"));
  const lib = NodePath.join(base, "lib");
  const root = NodePath.join(base, "root");
  NodeFS.mkdirSync(lib);
  git(lib, "init", "-q");
  NodeFS.writeFileSync(NodePath.join(lib, "x.txt"), "lib\n");
  git(lib, "add", "x.txt");
  git(lib, "commit", "-qm", "lib");
  NodeFS.mkdirSync(root);
  git(root, "init", "-q");
  NodeFS.writeFileSync(NodePath.join(root, "a.txt"), "a\n");
  git(root, "add", "a.txt");
  git(root, "submodule", "add", "-q", lib, "sub");
  git(root, "commit", "-qm", "root");
  return root;
};

const layerTest = layer.pipe(Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)));

it.layer(layerTest)("CheckpointStore submodules", (it) => {
  it.effect("restores submodule edits made after a clean-start turn", () =>
    Effect.gen(function* () {
      const store = yield* CheckpointStore;
      const root = repoWithSubmodule();
      const head = yield* store.resolveCleanHead(root);
      if (head === null) yield* store.captureCheckpoint({ cwd: root, checkpointRef });
      else yield* store.captureHeadCheckpoint({ cwd: root, checkpointRef, head });
      NodeFS.writeFileSync(NodePath.join(root, "a.txt"), "agent\n");
      NodeFS.writeFileSync(NodePath.join(root, "sub/x.txt"), "agent\n");
      assert.isTrue(yield* store.restoreCheckpoint({ cwd: root, checkpointRef }));
      assert.deepStrictEqual(
        [read(NodePath.join(root, "a.txt")), read(NodePath.join(root, "sub/x.txt"))],
        ["a", "lib"],
      );
    }),
  );

  it.effect("leaves an excluded submodule alone on restore", () =>
    Effect.gen(function* () {
      const store = yield* CheckpointStore;
      const root = repoWithSubmodule();
      yield* store.captureCheckpoint({ cwd: root, checkpointRef, excludePaths: ["sub"] });
      NodeFS.writeFileSync(NodePath.join(root, "sub/x.txt"), "user edit\n");
      yield* store.restoreCheckpoint({ cwd: root, checkpointRef, excludePaths: ["sub"] });
      assert.strictEqual(read(NodePath.join(root, "sub/x.txt")), "user edit");
    }),
  );
});
