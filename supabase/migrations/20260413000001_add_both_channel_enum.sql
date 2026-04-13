-- Migration: Add 'both' to notification_channel_enum
-- Rollback: ALTER TYPE notification_channel_enum RENAME VALUE 'both' (not directly supported — would need recreate)

ALTER TYPE notification_channel_enum ADD VALUE IF NOT EXISTS 'both';
