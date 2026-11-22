import * as Layer from "effect/Layer";

import * as CheckpointStore from "./checkpointing/CheckpointStore.ts";
import * as VcsDriverRegistry from "./vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";

export * from "./checkpointing/CheckpointStore.ts";
export type { CheckpointStoreError } from "./checkpointing/Errors.ts";
export { parseTurnDiffFilesFromNumstat } from "./checkpointing/Diffs.ts";

/** CheckpointStore backed by git. Needs FileSystem, Path, ChildProcessSpawner and SecureRandom. */
export const layer = CheckpointStore.layer.pipe(
  Layer.provide(VcsDriverRegistry.layer),
  Layer.provide(VcsProcess.layer),
);
