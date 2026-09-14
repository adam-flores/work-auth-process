/**
 * The store holds two shapes (ADR-0009): tables that are updated in place, and
 * tables that are only ever appended to. Nothing here models the domain
 * relationally (ADR-0008) - the authorization record is a log, and it arrives
 * with the relay in a later ticket.
 */
export const SCHEMA_VERSION = 1;

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
`;
