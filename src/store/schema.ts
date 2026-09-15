/**
 * The store holds two shapes (ADR-0009): tables that are updated in place, and
 * tables that are only ever appended to. Nothing here models the domain
 * relationally (ADR-0008) - the authorization record is the `transitions` log
 * below, and the relay configuration it is routed against ships with the
 * repository instead (ADR-0011, `src/relay/config.ts`).
 *
 * The hierarchy is the exception, and deliberately so: it is reference data
 * rather than domain state (ADR-0011), it is a tree, and it is the one thing in
 * the store that foreign keys can usefully police.
 */
/**
 * Bumped for any change to the shape below, not only for a new table: a store on
 * disk built by an older shape is rebuilt on open (ADR-0008), and without the
 * bump it survives and then fails on the first write its old constraints refuse.
 */
export const SCHEMA_VERSION = 5;

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS store_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL,
    department TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS legal_entities (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS divisions (
    id              TEXT PRIMARY KEY,
    legal_entity_id TEXT NOT NULL REFERENCES legal_entities(id),
    name            TEXT NOT NULL,
    active          INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS departments (
    id                   TEXT PRIMARY KEY,
    division_id          TEXT NOT NULL REFERENCES divisions(id),
    name                 TEXT NOT NULL,
    active               INTEGER NOT NULL DEFAULT 1,
    heritage             TEXT,
    disclosure_treatment TEXT
  );

  /* An attribute hangs wherever it happens to hang (BDR-0008), so it cannot be a
     column on one level's table and cannot reference one parent table either.
     A department reads its own rows plus every row above it. */
  CREATE TABLE IF NOT EXISTS hierarchy_attributes (
    node_kind TEXT NOT NULL CHECK (node_kind IN ('legal-entity', 'division', 'department')),
    node_id   TEXT NOT NULL,
    name      TEXT NOT NULL,
    value     TEXT NOT NULL,
    PRIMARY KEY (node_kind, node_id, name, value)
  );

  /* Detail, never identity: in this data one cost center is carried by four
     departments, so nothing may be keyed on a code. */
  CREATE TABLE IF NOT EXISTS department_codes (
    department_id TEXT NOT NULL REFERENCES departments(id),
    kind          TEXT NOT NULL CHECK (kind IN ('cost-accounting', 'cost-center')),
    code          TEXT NOT NULL,
    shared        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (department_id, kind, code)
  );

  /* Mutable, updated in place, with no history (ADR-0009) - the opposite
     discipline from every table above departments. A submitter edits a row
     directly; nothing about a draft is ever appended anywhere. Every field
     but the two timestamps may be NULL, because a draft is allowed to be
     incomplete and completeness is only required at initiation. */
  CREATE TABLE IF NOT EXISTS drafts (
    id                          TEXT PRIMARY KEY,
    submitter_id                TEXT NOT NULL REFERENCES participants(id),
    project                     TEXT,
    requesting_department_id    TEXT REFERENCES departments(id),
    performing_department_id    TEXT REFERENCES departments(id),
    funding_type                TEXT CHECK (funding_type IN (
                                   'commercial-contract', 'government-commercial-item-contract',
                                   'government-negotiated-contract', 'company-funded'
                                 )),
    requesting_location_type    TEXT CHECK (requesting_location_type IN ('domestic', 'international')),
    performing_location_type    TEXT CHECK (performing_location_type IN ('domestic', 'international')),
    requesting_program_manager  TEXT,
    requesting_finance_approver TEXT,
    performing_program_manager  TEXT,
    performing_finance_approver TEXT,
    performing_contact          TEXT,
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
  );

  /* One-to-many, added and removed freely while the draft stands (BDR-0007).
     No FK to a completion state to police - a draft cannot be initiated at
     all, so there is nothing yet for a resource count to satisfy. */
  CREATE TABLE IF NOT EXISTS draft_resources (
    id           TEXT PRIMARY KEY,
    draft_id     TEXT NOT NULL REFERENCES drafts(id),
    budget_hours REAL NOT NULL,
    labor_rate   REAL NOT NULL
  );

  /* The record, once an authorization exists (ADR-0004, ADR-0009): appended
     only, never updated and never deleted. Position in the relay and every
     field's current value are folded from this table on read
     (src/authorizations/index.ts) - there is no status column and no field
     column here to drift from it. seq is the true append order; occurred_at
     is caller-suppliable business time and is not trusted for ordering.
     payload carries whatever the transition's kind needs (an initiation's
     draft contents, a correction's changed fields, ...) as JSON, because the
     shape differs by kind and this table does not model the domain
     relationally (see the file header). */
  CREATE TABLE IF NOT EXISTS transitions (
    seq              INTEGER PRIMARY KEY AUTOINCREMENT,
    id               TEXT NOT NULL UNIQUE,
    authorization_id TEXT NOT NULL,
    kind             TEXT NOT NULL,
    actor_id         TEXT NOT NULL REFERENCES participants(id),
    occurred_at      TEXT NOT NULL,
    payload          TEXT NOT NULL
  );

  /* Every read of an authorization - folding its position, its fields, this
     transition's own append - is "every transition naming this authorization
     id, in order". Without this, that scan is over every transition ever
     appended, for every authorization there is. */
  CREATE INDEX IF NOT EXISTS idx_transitions_authorization_id ON transitions(authorization_id);
`;

/**
 * Dropped children first: `PRAGMA foreign_keys` is on, so the order matters.
 * ADR-0008 makes the store disposable rather than migrated, which is why a drop
 * list is the whole of the upgrade story.
 */
export const DROP_ALL = `
  DROP TABLE IF EXISTS transitions;
  DROP TABLE IF EXISTS draft_resources;
  DROP TABLE IF EXISTS drafts;
  DROP TABLE IF EXISTS department_codes;
  DROP TABLE IF EXISTS hierarchy_attributes;
  DROP TABLE IF EXISTS departments;
  DROP TABLE IF EXISTS divisions;
  DROP TABLE IF EXISTS legal_entities;
  DROP TABLE IF EXISTS participants;
  DROP TABLE IF EXISTS store_meta;
`;
