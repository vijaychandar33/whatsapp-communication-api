-- Phase 1: invitations, avatar, refresh token metadata

CREATE TYPE "InvitationRole" AS ENUM ('ADMIN', 'AGENT', 'VIEWER');

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;

ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;

CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT,
    "role" "InvitationRole" NOT NULL DEFAULT 'AGENT',
    "token_hash" TEXT NOT NULL,
    "label" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "invitations_organization_id_idx" ON "invitations"("organization_id");

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
