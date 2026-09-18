#!/usr/bin/env node
/**
 * Return the store to its seeded state (ADR-0008: disposable, not migrated).
 * The same command a demo uses between walkthroughs.
 */
import { createService } from "../src/service/index.ts";
import { SYSTEM_PARTICIPANT_ID } from "../src/shared/rules.ts";
import { seedAuthorizationHistory } from "../src/fixtures/authorization-history.ts";

const service = createService();
try {
  const info = service.resetStore({ participantId: SYSTEM_PARTICIPANT_ID });
  // Layered on after the reset itself (#65, ADR-0006), rather than folded into
  // `resetStore`: a body of synthetic authorizations with months of transition
  // history, so the demo has somewhere to click that isn't empty.
  seedAuthorizationHistory(service);
  console.log(
    `store reset - schema v${info.schemaVersion}, ${info.participantCount} participants, ` +
      `${info.departmentCount} departments, seeded ${info.seededAt}, demo history seeded`,
  );
} finally {
  service.close();
}
