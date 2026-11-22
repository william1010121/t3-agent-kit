import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3-agent-kit/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { readableSearchText } from "../../orchestration-v2/messageSearchIndex.ts";
import { runMigrations } from "../Migrations.ts";

const createdAt = "2026-10-01T00:00:00.000Z";
const text = "see [my\\_file\\_name](https://example.test/a) please";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("081 escaped link labels", (it) => {
  it.effect("backfills search text for an escaped link label without a citation", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 80 });
      yield* sql`
        INSERT INTO orchestration_v2_projection_messages (
          message_id, thread_id, role, streaming, created_at, updated_at, payload_json
        ) VALUES ('escaped', 'thread:a', 'user', 0, ${createdAt}, ${createdAt}, ${JSON.stringify({ text })})
      `;
      yield* runMigrations({ toMigrationInclusive: 81 });

      // What the projection store writes for the same message on a fresh database.
      assert.equal(readableSearchText(text), "see [my_file_name](https://example.test/a) please");

      const [row] = yield* sql<{ readonly search_text: string | null }>`
        SELECT search_text FROM orchestration_v2_projection_messages WHERE message_id = 'escaped'
      `;
      const hits = yield* sql<{ readonly message_id: string }>`
        SELECT messages.message_id FROM orchestration_v2_message_search AS search
        INNER JOIN orchestration_v2_projection_messages AS messages ON messages.rowid = search.rowid
        WHERE orchestration_v2_message_search MATCH '"my_file_name"'
      `;
      assert.deepEqual(
        { searchText: row?.search_text ?? null, hits: hits.map((h) => h.message_id) },
        { searchText: readableSearchText(text), hits: ["escaped"] },
      );
    }),
  );
});
