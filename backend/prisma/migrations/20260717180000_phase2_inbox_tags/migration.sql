-- Phase 2: inbox + contacts tags/notes

ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "is_pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "unread_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_message_text" TEXT;

CREATE INDEX IF NOT EXISTS "conversations_organization_id_assigned_to_user_id_idx"
  ON "conversations"("organization_id", "assigned_to_user_id");

CREATE TABLE IF NOT EXISTS "tags" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_organization_id_name_key" ON "tags"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "tags_organization_id_idx" ON "tags"("organization_id");

CREATE TABLE IF NOT EXISTS "contact_tags" (
    "contact_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contact_id","tag_id")
);

CREATE TABLE IF NOT EXISTS "contact_notes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "author_user_id" TEXT,
    "note_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contact_notes_contact_id_idx" ON "contact_notes"("contact_id");
CREATE INDEX IF NOT EXISTS "contact_notes_organization_id_idx" ON "contact_notes"("organization_id");

DO $$ BEGIN
  ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
