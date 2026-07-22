-- Meta Business-Scoped User IDs (BSUID) per Contact × CommunicationAccount.
-- See: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/

CREATE TABLE "contact_account_identities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "communication_account_id" TEXT NOT NULL,
    "bsuid" VARCHAR(160),
    "parent_bsuid" VARCHAR(160),
    "username" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_account_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_account_identities_contact_id_communication_account_id_key"
  ON "contact_account_identities"("contact_id", "communication_account_id");

CREATE UNIQUE INDEX "contact_account_identities_communication_account_id_bsuid_key"
  ON "contact_account_identities"("communication_account_id", "bsuid");

CREATE INDEX "contact_account_identities_organization_id_bsuid_idx"
  ON "contact_account_identities"("organization_id", "bsuid");

CREATE INDEX "contact_account_identities_contact_id_idx"
  ON "contact_account_identities"("contact_id");

ALTER TABLE "contact_account_identities"
  ADD CONSTRAINT "contact_account_identities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_account_identities"
  ADD CONSTRAINT "contact_account_identities_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_account_identities"
  ADD CONSTRAINT "contact_account_identities_communication_account_id_fkey"
  FOREIGN KEY ("communication_account_id") REFERENCES "communication_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
