import { assert, it } from "@effect/vitest";
import { EventId, ProjectId } from "@t3-agent-kit/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectStore from "./ProjectStore.ts";

it.layer(ProjectStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)))(
  "ProjectStoreV2 migration baselines",
  (it) => {
    it.effect("keeps settings applied before a migration baseline is replayed", () =>
      Effect.gen(function* () {
        const projects = yield* ProjectStore.ProjectStoreV2;
        const projectId = ProjectId.make("project-baseline-settings");
        const at = "2026-03-24T00:00:00.000Z";
        const event = {
          aggregateKind: "project",
          aggregateId: projectId,
          occurredAt: at,
          commandId: null,
          causationEventId: null,
          correlationId: null,
          metadata: {},
        } as const;
        const created = {
          projectId,
          title: "repo",
          workspaceRoot: "/tmp/repo",
          defaultModelSelection: null,
          scripts: [],
          createdAt: at,
          updatedAt: at,
        };
        const trackedFolders = [{ path: "/tmp/shared", name: "Shared" }];
        const projectIcon = { kind: "monogram", text: "R", color: "violet" } as const;
        yield* projects.apply({
          ...event,
          sequence: 1,
          eventId: EventId.make("event-baseline-settings-created"),
          type: "project.created",
          payload: created,
        });
        yield* projects.apply({
          ...event,
          sequence: 2,
          eventId: EventId.make("event-baseline-settings-updated"),
          type: "project.meta-updated",
          payload: {
            projectId,
            defaultThreadEnvMode: "worktree",
            autoPull: true,
            faviconPath: "public/icon.svg",
            projectIcon,
            trackedFolders,
            pinnedAt: at,
            archivedAt: at,
            updatedAt: at,
          },
        });
        yield* projects.apply({
          ...event,
          sequence: 3,
          eventId: EventId.make(`migration:39:project:${projectId}:baseline`),
          type: "project.created",
          payload: { ...created, updatedAt: "2026-03-24T00:00:03.000Z" },
        });
        const project = Option.getOrNull(yield* projects.get(projectId));
        assert.deepStrictEqual(
          {
            defaultThreadEnvMode: project?.defaultThreadEnvMode,
            autoPull: project?.autoPull,
            faviconPath: project?.faviconPath,
            projectIcon: project?.projectIcon,
            trackedFolders: project?.trackedFolders,
            pinnedAt: project?.pinnedAt,
            archivedAt: project?.archivedAt,
          },
          {
            defaultThreadEnvMode: "worktree",
            autoPull: true,
            faviconPath: "public/icon.svg",
            projectIcon,
            trackedFolders,
            pinnedAt: at,
            archivedAt: at,
          },
        );

        yield* projects.apply({
          ...event,
          sequence: 4,
          eventId: EventId.make("event-baseline-settings-recreated"),
          type: "project.created",
          payload: { ...created, defaultThreadEnvMode: null, faviconPath: null, projectIcon: null },
        });
        const cleared = Option.getOrNull(yield* projects.get(projectId));
        assert.deepStrictEqual(
          [cleared?.defaultThreadEnvMode, cleared?.faviconPath, cleared?.projectIcon],
          [null, null, null],
        );
      }),
    );
  },
);
