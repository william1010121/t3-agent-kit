// Stand-in for T3 Code's persistence/Sqlite.ts: the same connection pragmas and migrations,
// without the server config, ownership lock and v1 import that file also wires in.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";
import * as NodeSqliteClient from "@t3-agent-kit/shared/nodeSqliteClient";

import { runMigrations } from "./Migrations.ts";

const WAL_SIZE_LIMIT_BYTES = 128 * 1024 * 1024;

const layerSetup = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`PRAGMA busy_timeout = 5000;`;
    yield* sql`PRAGMA foreign_keys = ON;`;
    const tables = yield* sql<{
      readonly count: number;
    }>`SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table'`;
    if (tables[0]?.count === 0) yield* sql`PRAGMA auto_vacuum = INCREMENTAL;`;
    yield* sql`PRAGMA journal_mode = WAL;`;
    yield* sql`PRAGMA synchronous = NORMAL;`;
    yield* sql`PRAGMA checkpoint_fullfsync = ON;`;
    yield* sql`PRAGMA temp_store = MEMORY;`;
    yield* sql.unsafe(`PRAGMA journal_size_limit = ${WAL_SIZE_LIMIT_BYTES};`);
    yield* runMigrations();
  }).pipe(Effect.withSpan("Sqlite.setup")),
);

/** Opens (creating if needed) the database at `dbPath` and migrates it to T3 Code's schema. */
export const layerFromPath = (dbPath: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true });
      return Layer.provideMerge(
        layerSetup,
        NodeSqliteClient.layer({ filename: dbPath, readerWorker: true, writerWorker: true }),
      );
    }),
  );

export const layerMemory = Layer.provideMerge(
  layerSetup,
  NodeSqliteClient.layer({ filename: ":memory:" }),
);
