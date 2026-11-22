// Stand-in for upstream's GitVcsDriverCore.ts, which implements branches, worktrees, status and
// review on top of the whole T3 server. Checkpoints only need the two helpers below.
import * as Effect from "effect/Effect";

import type * as GitVcsDriver from "./GitVcsDriver.ts";

export const PATCH_RENDER_PREFIX_ARGS = ["--src-prefix=a/", "--dst-prefix=b/"] as const;

function splitNullSeparatedPaths(input: string, truncated: boolean): string[] {
  const parts = input.split("\0");
  if (parts.length === 0) return [];

  if (truncated && parts[parts.length - 1]?.length) {
    parts.pop();
  }

  return parts.filter((value) => value.length > 0);
}

export function splitNullSeparatedGitStdoutPaths(
  result: Pick<GitVcsDriver.ExecuteGitResult, "stdout" | "stdoutTruncated">,
): string[] {
  return splitNullSeparatedPaths(result.stdout, result.stdoutTruncated);
}

export const makeGitVcsDriverCore = () =>
  Effect.die(new Error("GitVcsDriver is not part of @t3-agent-kit/checkpoint; use VcsDriver."));
