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
  {
    version: 6,
    name: "sizing of work items",
    sql: `
      ALTER TABLE work_items ADD COLUMN title TEXT;
      ALTER TABLE work_items ADD COLUMN words TEXT;
      ALTER TABLE work_items ADD COLUMN ref TEXT;
      ALTER TABLE work_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE work_items ADD COLUMN origin TEXT NOT NULL DEFAULT 'start';
      ALTER TABLE work_items ADD COLUMN sizing TEXT;
      ALTER TABLE work_items ADD COLUMN proposal TEXT;
      ALTER TABLE work_items ADD COLUMN sized TEXT;
      ALTER TABLE work_items ADD COLUMN build_started TEXT;
      ALTER TABLE work_items ADD COLUMN finished TEXT;
      UPDATE work_items SET sized = created,
        sizing = '{"size":{"by":"default","reason":"Made before premise sized work."},"stages":{"by":"default","reason":"Made before premise sized work: every stage."},"split":{"decision":"whole","by":"default","reason":"Made before premise sized work."}}'
        WHERE parent_id IS NULL;
    `,
  },
  {
    version: 7,
    name: "intake in a thin form",
    sql: `
      CREATE TABLE intake_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        number INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('session', 'page', 'premise', 'github', 'feedback')),
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL,
        kind TEXT,
        touches TEXT NOT NULL DEFAULT '[]',
        size TEXT,
        touches_floor INTEGER NOT NULL DEFAULT 0,
        route TEXT,
        reason TEXT,
        routed_by TEXT,
        joins INTEGER,
        answer TEXT,
        triage_job INTEGER,
        ask_id INTEGER,
        work_item_id INTEGER,
        reading_id INTEGER,
        received TEXT NOT NULL,
        triaged TEXT,
        fix_running TEXT,
        finished TEXT,
        UNIQUE (software_id, number)
      );
      CREATE INDEX intake_items_software ON intake_items(software_id, status);

      CREATE TABLE readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        trigger TEXT NOT NULL CHECK (trigger IN ('count', 'time', 'operator')),
        items TEXT NOT NULL DEFAULT '[]',
        short_list TEXT,
        status TEXT NOT NULL CHECK (status IN ('reading', 'done', 'failed')),
        job_id INTEGER,
        ask_id INTEGER,
        created TEXT NOT NULL,
        finished TEXT
      );
      CREATE INDEX readings_software ON readings(software_id, id);
    `,
  },
  {
    version: 8,
    name: "existing software, in a thin form",
    sql: `
      CREATE TABLE existing_softwares (
        software_id TEXT PRIMARY KEY REFERENCES softwares(id),
        source TEXT NOT NULL,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('folder', 'address')),
        status TEXT NOT NULL
          CHECK (status IN ('copying', 'copy-failed', 'recovering', 'taken-on', 'stopped')),
        problem TEXT,
        source_branch TEXT,
        base_commit TEXT,
        commits INTEGER NOT NULL DEFAULT 0,
        run TEXT NOT NULL DEFAULT '{}',
        could_not_check TEXT NOT NULL DEFAULT '[]',
        record_status TEXT NOT NULL DEFAULT 'not-yet'
          CHECK (record_status IN ('not-yet', 'asked', 'added', 'refused', 'failed')),
        record_request INTEGER,
        record_note TEXT,
        created TEXT NOT NULL
      );
    `,
  },
  {
    version: 9,
    name: "effort per software, and whether an intake item changes what the software must do",
    sql: `
      ALTER TABLE softwares ADD COLUMN effort TEXT NOT NULL DEFAULT 'medium'
        CHECK (effort IN ('low', 'medium', 'high'));
      ALTER TABLE intake_items ADD COLUMN changes_what INTEGER;
    `,
  },
  {
    version: 10,
    name: "measures and learning from corrections",
    sql: `
      CREATE TABLE page_presence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        ended TEXT
      );

      CREATE TABLE asks_shown (
        ask_id INTEGER PRIMARY KEY REFERENCES asks(id),
        shown TEXT NOT NULL
      );

      CREATE TABLE corrections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        kind TEXT NOT NULL CHECK (kind IN
          ('strike', 'edit', 'reject-draft', 'send-back', 'decline-gate', 'undo-split', 'bug-after-met')),
        source TEXT NOT NULL UNIQUE,
        what TEXT NOT NULL,
        said TEXT,
        touches TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('reading', 'read')),
        mistake TEXT,
        destination TEXT CHECK (destination IN ('software', 'taste', 'premise', 'none')),
        reason TEXT,
        line TEXT,
        topic TEXT,
        decided_by TEXT CHECK (decided_by IN ('agent', 'rule', 'operator')),
        job_id INTEGER,
        created TEXT NOT NULL,
        read TEXT
      );
      CREATE INDEX corrections_software ON corrections(software_id, id);

      CREATE TABLE lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        correction_id INTEGER NOT NULL UNIQUE REFERENCES corrections(id),
        software_id TEXT NOT NULL REFERENCES softwares(id),
        destination TEXT NOT NULL CHECK (destination IN ('software', 'taste', 'premise')),
        topic TEXT,
        text TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('live', 'deleted', 'dropped')),
        uses INTEGER NOT NULL DEFAULT 0,
        last_used TEXT,
        created TEXT NOT NULL,
        edited TEXT,
        ended TEXT,
        end_note TEXT
      );
      CREATE INDEX lessons_destination ON lessons(destination, state);

      CREATE TABLE learning_cursor (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_event INTEGER NOT NULL
      );
      INSERT INTO learning_cursor (id, last_event) SELECT 1, COALESCE(MAX(id), 0) FROM events;
    `,
  },
  {
    version: 11,
    name: "taste claims",
    sql: `
      CREATE TABLE claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        role TEXT NOT NULL,
        area TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'released')),
        proposal_ask INTEGER,
        decided TEXT,
        decision TEXT,
        created TEXT NOT NULL,
        released TEXT
      );
      CREATE INDEX claims_software ON claims(software_id, status);
    `,
  },
  {
    version: 12,
    name: "several softwares: pausing and archiving a software",
    sql: `
      ALTER TABLE softwares ADD COLUMN paused_at TEXT;
      ALTER TABLE softwares ADD COLUMN paused_why TEXT;
      ALTER TABLE softwares ADD COLUMN archived_at TEXT;
    `,
  },
  {
    version: 13,
    name: "budgets: an amount per software, and what the operator answered to an overrun",
    sql: `
      ALTER TABLE softwares ADD COLUMN budget_usd REAL;

      CREATE TABLE budget_overruns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        time TEXT NOT NULL,
        budget TEXT NOT NULL,
        spent TEXT NOT NULL,
        answer TEXT CHECK (answer IN ('raised', 'finish-change', 'left-paused')),
        answered TEXT,
        finish_item INTEGER
      );
      CREATE INDEX budget_overruns_software ON budget_overruns(software_id, id);
    `,
  },
  {
    version: 14,
    name: "intake beyond the thin form: feedback links, GitHub issues, receipts and comments",
    sql: `
      ALTER TABLE intake_items ADD COLUMN external_ref TEXT;
      ALTER TABLE intake_items ADD COLUMN receipt TEXT;
      ALTER TABLE intake_items ADD COLUMN held_at TEXT;
      CREATE UNIQUE INDEX intake_items_external ON intake_items(software_id, external_ref)
        WHERE external_ref IS NOT NULL;
      CREATE UNIQUE INDEX intake_items_receipt ON intake_items(receipt) WHERE receipt IS NOT NULL;

      CREATE TABLE feedback_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        token TEXT NOT NULL UNIQUE,
        created TEXT NOT NULL,
        revoked TEXT
      );
      CREATE INDEX feedback_links_software ON feedback_links(software_id, id);

      CREATE TABLE intake_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        software_id TEXT NOT NULL REFERENCES softwares(id),
        item_id INTEGER NOT NULL REFERENCES intake_items(id),
        about TEXT NOT NULL,
        text TEXT NOT NULL,
        request_id INTEGER,
        status TEXT NOT NULL CHECK (status IN ('asked', 'sent', 'refused', 'failed')),
        outcome TEXT,
        created TEXT NOT NULL
      );
      CREATE INDEX intake_comments_item ON intake_comments(item_id, id);

      ALTER TABLE readings ADD COLUMN sent_back_at TEXT;
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
