-- AlterTable
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_customer_message_at" TIMESTAMP(3);

-- Backfill from latest inbound message per conversation
UPDATE "conversations" c
SET "last_customer_message_at" = sub.last_inbound
FROM (
  SELECT "conversation_id", MAX("created_at") AS last_inbound
  FROM "messages"
  WHERE "direction" = 'INBOUND'
  GROUP BY "conversation_id"
) sub
WHERE c."id" = sub."conversation_id"
  AND c."last_customer_message_at" IS NULL;
