// The process input type VcsProcess shares with upstream's source-control-core/server/SourceControlHost.ts.
import type { VcsProcessExitFailureKind } from "@t3-agent-kit/contracts";

export interface SourceControlProcessInput {
  readonly operation: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly spawnCwd?: string;
  readonly stdin?: string;
  readonly onStdoutChunk?: (chunk: Uint8Array) => void;
  readonly env?: NodeJS.ProcessEnv;
  readonly allowNonZeroExit?: boolean;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly outputMode?: "error" | "truncate" | undefined;
  readonly appendTruncationMarker?: boolean;
  /**
   * Reads a failure the generic rules cannot, such as a host CLI's sign-in hint, from its stderr.
   * Null leaves it to them.
   */
  readonly classifyFailure?: (stderr: string) => VcsProcessExitFailureKind | null;
  /** The error's detail when the command reports something it was asked for as missing. */
  readonly notFoundDetail?: string;
  /**
   * Runs sharing a key run at most `limit` at a time, for a host that throttles bursts of its CLI.
   * The first run of a key fixes its limit.
   */
  readonly concurrency?: { readonly key: string; readonly limit: number };
}
