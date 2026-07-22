-- Contact lists (named groups of contacts) + membership

CREATE TABLE "contact_lists" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contact_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_list_members" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_list_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_lists_organization_id_name_key"
  ON "contact_lists"("organization_id", "name");

CREATE INDEX "contact_lists_organization_id_idx"
  ON "contact_lists"("organization_id");

CREATE UNIQUE INDEX "contact_list_members_list_id_contact_id_key"
  ON "contact_list_members"("list_id", "contact_id");

CREATE INDEX "contact_list_members_contact_id_idx"
  ON "contact_list_members"("contact_id");

ALTER TABLE "contact_lists"
  ADD CONSTRAINT "contact_lists_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contact_list_members"
  ADD CONSTRAINT "contact_list_members_list_id_fkey"
  FOREIGN KEY ("list_id") REFERENCES "contact_lists"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_list_members"
  ADD CONSTRAINT "contact_list_members_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
