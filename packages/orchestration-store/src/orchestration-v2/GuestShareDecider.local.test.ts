import { assert, it } from "@effect/vitest";
import {
  GUEST_RESOLVED_MESSAGE_LIMIT,
  GuestMessageId,
  GuestShareId,
  type ChatAttachment,
  type OrchestrationV2AppThread,
  type ThreadGuestMessage,
  type ThreadGuestShare,
} from "@t3-agent-kit/contracts";
import * as DateTime from "effect/DateTime";
import * as Result from "effect/Result";

import { decideGuestMessageSend, releasedGuestAttachmentIds } from "./GuestShareDecider.ts";

it("keeps the files of a sent guest message older than the resolved-message limit", () => {
  const attachment = { id: "guest-file", sizeBytes: 1 } as unknown as ChatAttachment;
  const message = (id: string, status: ThreadGuestMessage["status"]): ThreadGuestMessage => ({
    id: GuestMessageId.make(id),
    text: id,
    status,
    submittedAt: "2026-01-01T00:00:00.000Z",
  });
  const before: ThreadGuestShare = {
    id: GuestShareId.make("share"),
    host: "host.example",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    guestName: "Guest",
    messages: [
      { ...message("old-pending", "pending"), attachments: [attachment] },
      ...Array.from({ length: GUEST_RESOLVED_MESSAGE_LIMIT }, (_, index) =>
        message(`resolved-${index}`, "dismissed"),
      ),
    ],
  };
  const thread = { guestShare: before } as unknown as OrchestrationV2AppThread;
  const sent = Result.getOrThrow(
    decideGuestMessageSend({
      thread,
      guestMessageId: GuestMessageId.make("old-pending"),
      now: DateTime.makeUnsafe(0),
    }),
  );
  assert.deepStrictEqual(
    releasedGuestAttachmentIds(before, sent.thread.guestShare ?? null),
    [],
  );
});
