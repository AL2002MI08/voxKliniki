-- VoxKliniki Database Schema
-- Run: psql $DATABASE_URL -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Core Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL,
  code        VARCHAR NOT NULL UNIQUE,
  location    VARCHAR,
  phone_number VARCHAR,
  timezone    VARCHAR DEFAULT 'Africa/Kigali',
  is_active   BOOLEAN DEFAULT true,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name            VARCHAR NOT NULL,
  code            VARCHAR NOT NULL,
  status          VARCHAR DEFAULT 'open',       -- open | busy | closed
  staff_available INTEGER DEFAULT 1,
  avg_wait_time   INTEGER DEFAULT 30,           -- minutes
  specialties     TEXT[]  DEFAULT '{}',
  is_emergency    BOOLEAN DEFAULT false,
  inserted_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, code)
);

CREATE TABLE IF NOT EXISTS users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name                     VARCHAR NOT NULL,
  email                    VARCHAR NOT NULL UNIQUE,
  password_hash            VARCHAR NOT NULL,
  role                     VARCHAR DEFAULT 'staff',  -- staff | admin | doctor
  department_id            UUID REFERENCES departments(id) ON DELETE SET NULL,
  phone_number             VARCHAR,
  is_active                BOOLEAN DEFAULT true,
  notification_preferences JSONB DEFAULT '{}',
  inserted_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number       VARCHAR NOT NULL UNIQUE,
  name               VARCHAR,
  location           VARCHAR,
  insurance_provider VARCHAR,
  chronic_conditions TEXT[]  DEFAULT '{}',
  preferred_language VARCHAR DEFAULT 'rw',
  consent_given      BOOLEAN DEFAULT false,
  consent_timestamp  TIMESTAMPTZ,
  consent_revoked    BOOLEAN DEFAULT false,
  no_show_count      INTEGER DEFAULT 0,
  visit_count        INTEGER DEFAULT 0,
  inserted_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calls (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id             UUID NOT NULL REFERENCES patients(id),
  clinic_id              UUID NOT NULL REFERENCES clinics(id),
  twilio_call_sid        VARCHAR,
  language_code          VARCHAR DEFAULT 'rw',
  call_duration          INTEGER,               -- seconds
  call_transcript        TEXT,
  chief_complaint        VARCHAR,
  symptoms               TEXT[]  DEFAULT '{}',
  red_flag_detected      BOOLEAN DEFAULT false,
  red_flag_details       VARCHAR,
  urgency_tier           VARCHAR,               -- critical | high | medium | low
  recommended_department VARCHAR,
  secondary_departments  TEXT[]  DEFAULT '{}',
  queue_number           VARCHAR,
  appointment_time       TIMESTAMPTZ,
  consent_given          BOOLEAN DEFAULT false,
  call_status            VARCHAR DEFAULT 'in_progress',  -- in_progress | completed | failed
  agent_summary          TEXT,
  inserted_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id                     UUID NOT NULL REFERENCES calls(id),
  clinic_id                   UUID NOT NULL REFERENCES clinics(id),
  department_id               UUID NOT NULL REFERENCES departments(id),
  patient_id                  UUID NOT NULL REFERENCES patients(id),
  queue_number                VARCHAR NOT NULL UNIQUE,
  urgency_tier                VARCHAR NOT NULL,
  position_in_queue           INTEGER,
  status                      VARCHAR DEFAULT 'waiting',  -- waiting | checked_in | in_progress | completed | no_show
  estimated_wait_time         INTEGER,                    -- minutes
  critical_alert_acknowledged BOOLEAN DEFAULT false,
  acknowledged_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at             TIMESTAMPTZ,
  checked_in_at               TIMESTAMPTZ,
  in_progress_at              TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  notes                       TEXT,
  inserted_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS followup_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id UUID NOT NULL REFERENCES queue_entries(id) ON DELETE CASCADE,
  to_phone       VARCHAR NOT NULL,
  message        VARCHAR(160) NOT NULL,
  sent_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at        TIMESTAMPTZ DEFAULT NOW(),
  inserted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(queue_entry_id, message)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_queue_clinic_status   ON queue_entries(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_dept_status     ON queue_entries(department_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_urgency         ON queue_entries(urgency_tier);
CREATE INDEX IF NOT EXISTS idx_queue_patient         ON queue_entries(patient_id);
CREATE INDEX IF NOT EXISTS idx_calls_patient         ON calls(patient_id);
CREATE INDEX IF NOT EXISTS idx_calls_clinic          ON calls(clinic_id);
CREATE INDEX IF NOT EXISTS idx_calls_twilio          ON calls(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_users_clinic          ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone        ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_followup_queue_entry  ON followup_messages(queue_entry_id);

-- ── Hospitals ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR NOT NULL,
  district     VARCHAR NOT NULL,
  province     VARCHAR NOT NULL,
  address      VARCHAR,
  phone_number VARCHAR,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  specialties  TEXT[]  DEFAULT '{}',
  is_emergency BOOLEAN DEFAULT false,
  is_active    BOOLEAN DEFAULT true,
  inserted_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_district ON hospitals(district);
CREATE INDEX IF NOT EXISTS idx_hospitals_coords   ON hospitals(latitude, longitude);
