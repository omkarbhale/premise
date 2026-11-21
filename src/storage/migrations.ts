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
  {
    version: 3,
    name: "record-changes",
    sql: `
      CREATE TABLE record_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        proposed_by TEXT,
        reason TEXT NOT NULL,
        operations TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN ('rejected', 'reviewing', 'at-say-back', 'accepted', 'committed')),
        diagnostics TEXT NOT NULL DEFAULT '[]',
        base_hashes TEXT NOT NULL DEFAULT '{}',
        new_files TEXT NOT NULL DEFAULT '{}',
        assigned TEXT NOT NULL DEFAULT '[]',
        touched TEXT NOT NULL DEFAULT '[]',
        say_back_for TEXT NOT NULL DEFAULT '[]',
        review TEXT,
        commit_sha TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
      CREATE INDEX record_changes_software ON record_changes(software_id);
    `,
  },
  {
    version: 4,
    name: "runs-and-reports",
    sql: `
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        commit_sha TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('web', 'command', 'program')),
        status TEXT NOT NULL
          CHECK (status IN ('starting', 'running', 'finished', 'built', 'crashed', 'failed', 'stopped')),
        command TEXT,
        port INTEGER,
        link TEXT,
        pid INTEGER,
        restarts INTEGER NOT NULL DEFAULT 0,
        exit_code INTEGER,
        confined INTEGER NOT NULL DEFAULT 1,
        failure TEXT,
        sample_output TEXT,
        log_file TEXT,
        started TEXT NOT NULL,
        ended TEXT
      );
      CREATE INDEX runs_software ON runs(software_id, id);

      CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        trigger TEXT NOT NULL,
        reference TEXT,
        written TEXT NOT NULL,
        view TEXT NOT NULL,
        release_notes TEXT
      );
      CREATE INDEX reports_software ON reports(software_id, id);
    `,
  },
  {
    version: 5,
    name: "line engine and gate",
    sql: `
      CREATE TABLE work_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        parent_id INTEGER REFERENCES work_items(id),
        kind TEXT NOT NULL CHECK (kind IN ('software', 'milestone', 'module', 'intake')),
        size_class TEXT NOT NULL DEFAULT 'small',
        current_stage TEXT NOT NULL DEFAULT 'why',
        state TEXT NOT NULL DEFAULT 'active',
        stages TEXT NOT NULL,
        line_state TEXT NOT NULL DEFAULT '{}',
        created TEXT NOT NULL
      );
      CREATE INDEX work_items_software ON work_items(software_id, parent_id);
      INSERT INTO work_items (software_id, kind, size_class, current_stage, state, stages, created)
        SELECT id, 'software', size_class, current_stage, state,
          '["why","who","exists","what","say-back","plan","build","check","run","report","intake"]',
          created FROM softwares;

      CREATE TABLE stage_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        work_item_id INTEGER NOT NULL REFERENCES work_items(id),
        stage TEXT NOT NULL,
        milestone TEXT,
        entered TEXT NOT NULL,
        exited TEXT,
        exit_reason TEXT,
        budget_turns INTEGER,
        budget_minutes INTEGER,
        used_minutes REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX stage_runs_software ON stage_runs(software_id, id);

      CREATE TABLE gate_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        floor_kind TEXT NOT NULL,
        action TEXT NOT NULL,
        why TEXT NOT NULL,
        items TEXT NOT NULL DEFAULT '[]',
        requested_by TEXT NOT NULL,
        job_id INTEGER REFERENCES jobs(id),
        perform TEXT,
        role_asked TEXT NOT NULL,
        ask_id INTEGER REFERENCES asks(id),
        status TEXT NOT NULL CHECK (status IN ('asked', 'approved', 'refused', 'done', 'failed')),
        approval_used INTEGER,
        outcome TEXT,
        created TEXT NOT NULL,
        decided TEXT
      );
      CREATE INDEX gate_requests_software ON gate_requests(software_id, status);

      CREATE TABLE approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        scope TEXT NOT NULL CHECK (scope IN ('once', 'kind')),
        floor_kind TEXT NOT NULL,
        request_id INTEGER REFERENCES gate_requests(id),
        role TEXT NOT NULL,
        given TEXT NOT NULL,
        withdrawn TEXT
      );

    `,
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
