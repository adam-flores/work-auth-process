#!/usr/bin/env node
/**
 * Return the store to its seeded state (ADR-0008: disposable, not migrated).
 * The same command a demo uses between walkthroughs.
 */
import { createService } from "../src/service/index.ts";
import { SYSTEM_PARTICIPANT_ID } from "../src/shared/rules.ts";

const service = createService();
try {
  const info = service.resetStore({ participantId: SYSTEM_PARTICIPANT_ID });
  console.log(
    `store reset - schema v${info.schemaVersion}, ${info.participantCount} participants, seeded ${info.seededAt}`,
  );
} finally {
  service.close();
}
