/**
 * Numbered schema migrations. Never edit one that has shipped; add the next number.
 * Tables arrive with the module that owns them (decision 0147); see docs/specs/storage.md.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "foundation",
    sql: `
      CREATE TABLE softwares (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repository TEXT,
        size_class TEXT NOT NULL DEFAULT 'small',
        current_stage TEXT NOT NULL DEFAULT 'why',
        state TEXT NOT NULL DEFAULT 'active'
          CHECK (state IN ('active', 'paused-budget', 'paused-usage', 'waiting-milestone', 'ended')),
        priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
        milestone_waits INTEGER NOT NULL DEFAULT 0 CHECK (milestone_waits IN (0, 1)),
        weekly_share_percent INTEGER,
        created TEXT NOT NULL
      );

      CREATE TABLE page_tokens (
        token_hash TEXT PRIMARY KEY,
        created TEXT NOT NULL,
        revoked TEXT
      );

      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        kind TEXT NOT NULL,
        stage TEXT,
        items TEXT NOT NULL DEFAULT '[]',
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'running', 'waiting', 'paused', 'done', 'stuck', 'failed', 'stopped')),
        attempts INTEGER NOT NULL DEFAULT 0,
        failure_signature TEXT,
        same_failure_count INTEGER NOT NULL DEFAULT 0,
        waiting_on TEXT,
        note TEXT,
        result TEXT,
        created TEXT NOT NULL,
        started TEXT,
        finished TEXT
      );
      CREATE INDEX jobs_status ON jobs(status);

      CREATE TABLE agent_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        runtime_session_id TEXT NOT NULL,
        job_id INTEGER NOT NULL REFERENCES jobs(id),
        agent_role TEXT NOT NULL,
        runtime TEXT NOT NULL,
        model TEXT NOT NULL,
        effort TEXT NOT NULL,
        started TEXT NOT NULL,
        ended TEXT,
        end_reason TEXT,
        turns INTEGER
      );

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time TEXT NOT NULL,
        software_id TEXT,
        module TEXT NOT NULL,
        kind TEXT NOT NULL,
        reference TEXT,
        detail TEXT
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        changed TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "session: chat and asks",
    sql: `
      CREATE TABLE chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT REFERENCES softwares(id),
        author TEXT NOT NULL CHECK (author IN ('person', 'premise')),
        text TEXT NOT NULL,
        routed_to TEXT,
        ask_id INTEGER,
        time TEXT NOT NULL
      );
      CREATE INDEX chat_messages_software ON chat_messages(software_id, id);

      CREATE TABLE asks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        role TEXT NOT NULL,
        kind TEXT NOT NULL
          CHECK (kind IN ('question', 'draft', 'say-back', 'proposal', 'approval', 'needed')),
        stage TEXT,
        title TEXT NOT NULL,
        instruction TEXT NOT NULL,
        items TEXT NOT NULL DEFAULT '[]',
        extra TEXT NOT NULL DEFAULT '{}',
        waiting_job INTEGER REFERENCES jobs(id),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'withdrawn')),
        answer TEXT,
        answer_summary TEXT,
        asked TEXT NOT NULL,
        answered TEXT
      );
      CREATE INDEX asks_status ON asks(status, software_id);

      ALTER TABLE softwares ADD COLUMN idea TEXT NOT NULL DEFAULT '';
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
