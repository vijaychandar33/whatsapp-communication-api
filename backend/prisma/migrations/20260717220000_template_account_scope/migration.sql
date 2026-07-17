-- Bind message templates to a WhatsApp account (multi-WABA safe).
ALTER TABLE "message_templates"
  ADD COLUMN IF NOT EXISTS "communication_account_id" TEXT;

ALTER TABLE "message_templates"
  DROP CONSTRAINT IF EXISTS "message_templates_organization_id_channel_code_name_language_key";

CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_organization_id_communication_account_id_name_language_key"
  ON "message_templates" ("organization_id", "communication_account_id", "name", "language");

CREATE INDEX IF NOT EXISTS "message_templates_organization_id_communication_account_id_idx"
  ON "message_templates" ("organization_id", "communication_account_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_templates_communication_account_id_fkey'
  ) THEN
    ALTER TABLE "message_templates"
      ADD CONSTRAINT "message_templates_communication_account_id_fkey"
      FOREIGN KEY ("communication_account_id")
      REFERENCES "communication_accounts"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
