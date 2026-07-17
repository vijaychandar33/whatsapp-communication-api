-- Drop legacy unique index that blocks multi-account templates.
-- PostgreSQL truncates long identifier names; both spellings are covered.
DROP INDEX IF EXISTS "message_templates_organization_id_channel_code_name_languag_key";
DROP INDEX IF EXISTS "message_templates_organization_id_channel_code_name_language_key";
