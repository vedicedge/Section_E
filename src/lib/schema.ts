/**
 * Ordered, append-only migrations. Never edit an entry that has shipped — add a new one.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE students (
    roll_no         TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    source          TEXT NOT NULL DEFAULT 'manual',
    pin_hash        TEXT,
    claimed_at      TIMESTAMPTZ,
    session_version INTEGER NOT NULL DEFAULT 1,
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE seating_plans (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL,
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'class' CHECK (kind IN ('class', 'exam')),
    room        TEXT,
    aliases     JSONB NOT NULL DEFAULT '[]',
    valid_from  DATE,
    valid_to    DATE,
    layout      JSONB NOT NULL,
    notes       TEXT,
    source_name TEXT,
    batch_id    TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE seat_assignments (
    plan_id     TEXT NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
    roll_no     TEXT NOT NULL,
    row_label   TEXT NOT NULL,
    row_number  INTEGER,
    row_index   INTEGER NOT NULL,
    seat_number INTEGER NOT NULL,
    position    INTEGER NOT NULL,
    note        TEXT,
    PRIMARY KEY (plan_id, roll_no)
  );
  CREATE INDEX seat_assignments_roll_idx ON seat_assignments (roll_no);

  CREATE TABLE quizzes (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    subject           TEXT,
    description       TEXT NOT NULL DEFAULT '',
    instructions      TEXT NOT NULL DEFAULT '',
    duration_minutes  INTEGER,
    opens_at          TIMESTAMPTZ,
    closes_at         TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    max_attempts      INTEGER NOT NULL DEFAULT 1,
    shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE,
    shuffle_options   BOOLEAN NOT NULL DEFAULT FALSE,
    show_answers      TEXT NOT NULL DEFAULT 'after_submit' CHECK (show_answers IN ('after_submit', 'after_close', 'never')),
    negative_marking  DOUBLE PRECISION NOT NULL DEFAULT 0,
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE quiz_questions (
    id          TEXT PRIMARY KEY,
    quiz_id     TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    prompt      TEXT NOT NULL,
    options     JSONB NOT NULL,
    correct     JSONB NOT NULL,
    multiple    BOOLEAN NOT NULL DEFAULT FALSE,
    points      DOUBLE PRECISION NOT NULL DEFAULT 1,
    explanation TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX quiz_questions_quiz_idx ON quiz_questions (quiz_id, position);

  CREATE TABLE quiz_attempts (
    id             TEXT PRIMARY KEY,
    quiz_id        TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    roll_no        TEXT NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline_at    TIMESTAMPTZ,
    submitted_at   TIMESTAMPTZ,
    auto_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    question_order JSONB NOT NULL,
    answers        JSONB NOT NULL DEFAULT '{}',
    flagged        JSONB NOT NULL DEFAULT '[]',
    score          DOUBLE PRECISION,
    max_score      DOUBLE PRECISION,
    result         JSONB
  );
  CREATE INDEX quiz_attempts_lookup_idx ON quiz_attempts (quiz_id, roll_no);

  CREATE TABLE app_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE rate_limits (
    key      TEXT PRIMARY KEY,
    count    INTEGER NOT NULL,
    reset_at TIMESTAMPTZ NOT NULL
  );
  `,

  // 2 — homework, per-student completion, web-push subscriptions, notification de-duplication.
  `
  CREATE TABLE homework (
    id            TEXT PRIMARY KEY,
    subject_code  TEXT NOT NULL,
    subject_title TEXT NOT NULL,
    title         TEXT NOT NULL,
    details       TEXT NOT NULL DEFAULT '',
    given_on      DATE NOT NULL,
    due_mode      TEXT NOT NULL CHECK (due_mode IN ('next_class', 'date')),
    due_date      DATE,
    due_time      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX homework_given_idx ON homework (given_on);
  CREATE INDEX homework_due_idx ON homework (due_date);

  CREATE TABLE homework_done (
    homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
    roll_no     TEXT NOT NULL,
    done_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (homework_id, roll_no)
  );

  CREATE TABLE push_subscriptions (
    endpoint     TEXT PRIMARY KEY,
    roll_no      TEXT NOT NULL,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at TIMESTAMPTZ,
    failures     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX push_subscriptions_roll_idx ON push_subscriptions (roll_no);

  CREATE TABLE notification_log (
    key        TEXT PRIMARY KEY,
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    recipients INTEGER NOT NULL DEFAULT 0,
    detail     TEXT
  );
  `,

  // 3 — attendance: each student's own leave count per subject (private; no FK, like homework_done).
  `
  CREATE TABLE attendance (
    roll_no        TEXT NOT NULL,
    subject_id     TEXT NOT NULL,
    total_override INTEGER CHECK (total_override BETWEEN 1 AND 200),
    held           INTEGER CHECK (held BETWEEN 0 AND 200),
    held_on        DATE,
    missed         INTEGER NOT NULL DEFAULT 0 CHECK (missed BETWEEN 0 AND 200),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (roll_no, subject_id)
  );
  `,
];
