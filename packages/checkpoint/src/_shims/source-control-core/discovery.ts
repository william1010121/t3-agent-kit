// The one helper the git driver uses from upstream's source-control-core/server/discovery.ts.
import { VcsProcessSpawnError } from "@t3-agent-kit/contracts";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

const isVcsProcessSpawnError = Schema.is(VcsProcessSpawnError);

export function isMissingExecutable(error: unknown): boolean {
  return (
    isVcsProcessSpawnError(error) &&
    PlatformError.isPlatformError(error.cause) &&
    error.cause.reason._tag === "NotFound" &&
    error.cause.reason.module === "ChildProcess"
  );
}
