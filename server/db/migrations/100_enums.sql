-- 100_enums.sql: ScreenGuide's enum types (all ScreenGuide schema starts at 100).

CREATE TYPE assist_session_status AS ENUM ('active', 'paused', 'resolved', 'escalated', 'abandoned', 'ended');

CREATE TYPE assist_category AS ENUM (
  'printer', 'network', 'email', 'm365', 'account', 'performance', 'browser', 'audio_video', 'other'
);

CREATE TYPE model_tier AS ENUM ('fast', 'smart');

CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

CREATE TYPE input_mode AS ENUM ('voice', 'text', 'auto');

CREATE TYPE step_outcome AS ENUM ('pending', 'completed', 'failed', 'skipped');

CREATE TYPE ticket_urgency AS ENUM ('low', 'normal', 'high');

CREATE TYPE push_status AS ENUM ('not_pushed', 'queued', 'pushed', 'push_failed');

CREATE TYPE usage_type AS ENUM (
  'greet', 'turn', 'observe', 'summary', 'finalize', 'ticket', 'tts', 'stt_minutes',
  'model_switch', 'safety_block', 'error'
);

CREATE TYPE org_plan AS ENUM ('free', 'team');
