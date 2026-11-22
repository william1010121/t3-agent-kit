import { assert, describe, it } from "@effect/vitest";
import { CommandId, EventId, ProjectId } from "@t3-agent-kit/contracts";
import * as DateTime from "effect/DateTime";
import * as Result from "effect/Result";

import { planProjectCommand } from "./ProjectCommands.ts";

describe("planProjectCommand project.create", () => {
  it("rejects script IDs that cannot be bound to a keybinding", () => {
    const result = planProjectCommand({
      command: {
        type: "project.create",
        commandId: CommandId.make("cmd-create-invalid-script"),
        projectId: ProjectId.make("project-invalid-script"),
        title: "Scripts",
        workspaceRoot: "/tmp/invalid-script",
        scripts: [
          {
            id: "another.invalid.id",
            name: "Lint",
            command: "vp lint",
            icon: "lint",
            runOnWorktreeCreate: false,
          },
        ],
      },
      state: { project: undefined, workspaceOwner: undefined },
      eventId: EventId.make("event:planned"),
      now: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
    });
    assert.isTrue(Result.isFailure(result));
  });
});
