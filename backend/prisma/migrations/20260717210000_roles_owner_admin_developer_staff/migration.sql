-- New inviteable roles. AGENT/VIEWER remain for legacy invitation rows.
ALTER TYPE "InvitationRole" ADD VALUE IF NOT EXISTS 'DEVELOPER';
ALTER TYPE "InvitationRole" ADD VALUE IF NOT EXISTS 'STAFF';
