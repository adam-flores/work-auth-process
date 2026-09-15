/**
 * The store holds two shapes (ADR-0009): tables that are updated in place, and
 * tables that are only ever appended to. Nothing here models the domain
 * relationally (ADR-0008) - the authorization record is a log, and it arrives
 * with the relay in a later ticket.
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
export const SCHEMA_VERSION = 3;

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
`;

/**
 * Dropped children first: `PRAGMA foreign_keys` is on, so the order matters.
 * ADR-0008 makes the store disposable rather than migrated, which is why a drop
 * list is the whole of the upgrade story.
 */
export const DROP_ALL = `
  DROP TABLE IF EXISTS department_codes;
  DROP TABLE IF EXISTS hierarchy_attributes;
  DROP TABLE IF EXISTS departments;
  DROP TABLE IF EXISTS divisions;
  DROP TABLE IF EXISTS legal_entities;
  DROP TABLE IF EXISTS participants;
  DROP TABLE IF EXISTS store_meta;
`;
