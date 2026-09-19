import type { Service } from "../service/index.ts";
import type { FundingType, LocationType } from "../shared/constants.ts";

/**
 * Fixture-time transition history (#65, ADR-0006): a body of synthetic
 * authorizations pushed entirely through the same command surface the
 * product itself uses, so no sequence produced here is one the product
 * could not have produced.
 *
 * Deliberately not wired into `resetStore` or into the store's own seeding
 * (`src/store/index.ts`) - both are shared with the service test suite, which
 * depends on a reset returning a pristine, authorization-free store with the
 * exact seeded hierarchy (`tests/service/hierarchy.test.ts`'s repeatability
 * checks). This runs as an explicit extra step after a reset instead
 * (`scripts/reset-store.ts`), the same way a demo operator prepares a
 * walkthrough - "generated at fixture time" without redefining what a plain
 * reset means for everything else that depends on it.
 *
 * Every scenario below routes through the same one requesting/performing
 * department pairing (#92): the demo catalog seeds exactly one Approver per
 * side and one Contributor, so that pairing - Rotor Assemblies requesting,
 * Flight Controls Software performing - is the only one anybody in the
 * roster can carry all the way to completion. The variety across scenarios
 * is in what happens along the way (a referral, a correction and re-review,
 * a hold, a revocation), not in which departments are named. Every scenario
 * is also company-funded with matching location types, so neither gate ever
 * fires - the roster seeds no Approver for Contracts or Global Trade
 * (`config/participants.json`).
 */

type Actor = { participantId: string };

const SYSTEM: Actor = { participantId: "system" };

/**
 * Every authorization here is submitted by the same person - an
 * Administrator who, per CONTEXT.md, is mocked like everyone else and is
 * free to also need work from another department. Their own seeded
 * department (Sensor Integration) is never used as a requesting or
 * performing department below, which is what keeps every seeded
 * authorization's submitter distinct from anyone who acts on it - nobody
 * here approves their own request.
 */
const SUBMITTER_NAME = "Teo Brandt";

function department(service: Service, name: string): string {
  const found = service
    .searchDepartments(SYSTEM, { includeInactive: true })
    .find((d) => d.name === name);
  if (!found) throw new Error(`Fixture generator: no department named "${name}".`);
  return found.id;
}

function participant(service: Service, name: string): Actor {
  const found = service.listParticipants(SYSTEM).find((p) => p.name === name);
  if (!found) throw new Error(`Fixture generator: no participant named "${name}".`);
  return { participantId: found.id };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** A small seeded PRNG (mulberry32), so the same run always spaces
 *  transitions the same plausible-looking way without a dependency for it. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A cursor through business time, advanced one plausible interval at a time
 * (ADR-0006: "spread over a plausible period with plausible intervals").
 * Only ever moves forward, so every `occurredAt` a single authorization's
 * life supplies reads later than the one before it - the same discipline a
 * real relay's timestamps always have, and exactly what `TransitionOptions`
 * lets a caller supply instead of the clock (`shared/rules.ts`).
 */
class Clock {
  private ms: number;
  private readonly rand: () => number;

  constructor(startAt: Date, seed: number) {
    this.ms = startAt.getTime();
    this.rand = mulberry32(seed);
  }

  /** Advances somewhere between `minHours` and `maxHours` and returns the
   *  transition options carrying the new instant. */
  step(minHours: number, maxHours: number): { occurredAt: string } {
    this.ms += (minHours + this.rand() * (maxHours - minHours)) * 60 * 60 * 1000;
    return { occurredAt: new Date(this.ms).toISOString() };
  }
}

type NewAuthorizationFields = {
  project: string;
  requestingDepartment: string;
  performingDepartment: string;
  fundingType: FundingType;
  requestingLocationType: LocationType;
  performingLocationType: LocationType;
  requestingProgramManager: string;
  requestingFinanceApprover: string;
  performingProgramManager: string;
  performingFinanceApprover: string;
  performingContact?: string;
  budgetHours: number;
  laborRate: number;
};

/** Creates a complete draft and initiates it in one step - every seeded
 *  authorization starts from a draft the same way a submitter's would,
 *  rather than skipping to whatever `appendInitiationTransition` would
 *  accept directly. */
function initiate(service: Service, submitter: Actor, clock: Clock, fields: NewAuthorizationFields) {
  const draft = service.createDraft(submitter, {
    project: fields.project,
    requestingDepartmentId: department(service, fields.requestingDepartment),
    performingDepartmentId: department(service, fields.performingDepartment),
    fundingType: fields.fundingType,
    requestingLocationType: fields.requestingLocationType,
    performingLocationType: fields.performingLocationType,
    requestingProgramManager: fields.requestingProgramManager,
    requestingFinanceApprover: fields.requestingFinanceApprover,
    performingProgramManager: fields.performingProgramManager,
    performingFinanceApprover: fields.performingFinanceApprover,
    performingContact: fields.performingContact ?? null,
  });
  service.addResource(submitter, draft.id, { budgetHours: fields.budgetHours, laborRate: fields.laborRate });
  return service.initiateDraft(submitter, draft.id, clock.step(0, 3));
}

/** A full happy path, start to finish - the shortest complete story the
 *  relay tells, and the one #92's demo script is built around. */
function seedHappyPath(service: Service, submitter: Actor): void {
  const clock = new Clock(daysAgo(165), 1);
  const auth = initiate(service, submitter, clock, {
    project: "Heat Shield Bracket Retrofit",
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 120,
    laborRate: 85,
  });

  const priya = participant(service, "Priya Anand");
  service.acknowledge(priya, auth.id, clock.step(4, 30)); // requesting-program-manager
  service.acknowledge(priya, auth.id, clock.step(4, 30)); // requesting-finance

  const jordan = participant(service, "Jordan Hale");
  service.claim(jordan, auth.id, clock.step(3, 20));
  service.contribute(jordan, auth.id, { performingEmployee: "Priya Solanki", ...clock.step(4, 36) });

  const marcus = participant(service, "Marcus Oduya");
  service.acknowledge(marcus, auth.id, clock.step(4, 30)); // performing-program-manager
  service.acknowledge(marcus, auth.id, clock.step(4, 30)); // performing-finance

  service.mintChargeNumber(participant(service, "Elin Vasquez"), auth.id, {
    chargeNumber: "CN-10234",
    ...clock.step(6, 48),
  });
}

/** A full happy path with a referral along the way (BDR-0011) - shown to a
 *  colleague outside the routing, who never has to act for the authorization
 *  to keep moving. */
function seedHappyPathWithReferral(service: Service, submitter: Actor): void {
  const clock = new Clock(daysAgo(140), 2);
  const auth = initiate(service, submitter, clock, {
    project: "Turbine Duct Liner Program",
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    performingContact: "Devon Okafor",
    budgetHours: 260,
    laborRate: 95,
  });

  const priya = participant(service, "Priya Anand");
  service.acknowledge(priya, auth.id, clock.step(6, 30));
  service.acknowledge(priya, auth.id, clock.step(6, 30));

  const jordan = participant(service, "Jordan Hale");
  service.claim(jordan, auth.id, clock.step(4, 24));
  service.contribute(jordan, auth.id, { performingEmployee: "Devon Okafor", ...clock.step(4, 36) });

  const marcus = participant(service, "Marcus Oduya");
  service.refer(marcus, auth.id, { colleagueId: participant(service, "Elin Vasquez").participantId, ...clock.step(2, 12) });
  service.acknowledge(marcus, auth.id, clock.step(4, 24));
  service.acknowledge(marcus, auth.id, clock.step(4, 30));

  service.mintChargeNumber(participant(service, "Elin Vasquez"), auth.id, {
    chargeNumber: "CN-10391",
    ...clock.step(6, 48),
  });
}

/** A correction that reaches back and re-reviews an already-resolved,
 *  earlier stage (#60, ADR-0005) - raised at the current stage, naming a
 *  field the relay's very first stage also depends on, then resolved and
 *  carried all the way to completion. */
function seedCorrectionAndReReview(service: Service, submitter: Actor): void {
  const clock = new Clock(daysAgo(115), 3);
  const auth = initiate(service, submitter, clock, {
    project: "Cabn Bracket Rwork",
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 90,
    laborRate: 78,
  });

  const priya = participant(service, "Priya Anand");
  service.acknowledge(priya, auth.id, clock.step(6, 30)); // requesting-program-manager
  service.acknowledge(priya, auth.id, clock.step(6, 30)); // requesting-finance

  const jordan = participant(service, "Jordan Hale");
  service.claim(jordan, auth.id, clock.step(4, 24));
  service.contribute(jordan, auth.id, { performingEmployee: "Marcus Tejeda", ...clock.step(4, 30) });

  const marcus = participant(service, "Marcus Oduya");
  service.requestCorrection(marcus, auth.id, {
    fields: ["project"],
    comment: "Project name looks misspelled - please confirm and correct it.",
    ...clock.step(4, 24),
  });
  service.correct(submitter, auth.id, { project: "Cabin Bracket Rework", ...clock.step(4, 30) });

  // The correction reached "project," a dependency of requesting-program-manager
  // (already resolved above) as well as of this stage - resolving it here
  // returns the authorization to that earlier stage for re-review first.
  service.acknowledge(priya, auth.id, clock.step(6, 30)); // requesting-program-manager, re-review
  service.acknowledge(marcus, auth.id, clock.step(6, 30)); // performing-program-manager, fresh arrival
  service.acknowledge(marcus, auth.id, clock.step(6, 30)); // performing-finance

  service.mintChargeNumber(participant(service, "Elin Vasquez"), auth.id, {
    chargeNumber: "CN-10412",
    ...clock.step(6, 48),
  });
}

/** A hold and its release, followed by a withdrawal partway through the
 *  relay - the submitter's own reasons for pausing and then giving up on an
 *  authorization, never anybody else's. */
function seedHoldReleaseWithdrawn(service: Service, submitter: Actor): void {
  const clock = new Clock(daysAgo(90), 4);
  const auth = initiate(service, submitter, clock, {
    project: "Compressor Housing Line Support",
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 60,
    laborRate: 72,
  });

  const priya = participant(service, "Priya Anand");
  service.acknowledge(priya, auth.id, clock.step(6, 30));
  service.hold(submitter, auth.id, clock.step(2, 12));
  service.release(submitter, auth.id, clock.step(48, 96));
  service.acknowledge(priya, auth.id, clock.step(6, 30));

  const jordan = participant(service, "Jordan Hale");
  service.claim(jordan, auth.id, clock.step(4, 24));
  service.contribute(jordan, auth.id, { performingEmployee: "Ines Marchetti", ...clock.step(4, 30) });

  service.withdraw(submitter, auth.id, clock.step(24, 72));
}

/**
 * Two authorizations revoked by the same hierarchy change (BDR-0010's
 * fan-out), both naming the one seeded department with no Approver of its
 * own (`config/participants.json` seeds nobody at "Heat Shielding") - they
 * can never reach anyone's queue regardless, which is what makes it the one
 * department this fixture can close without touching anything a live demo
 * still needs. `setHierarchyNodeInactive` supplies its own timestamp rather
 * than taking one (`service/index.ts`), so this happens at whatever "now"
 * the generator actually runs at - a recent administrative act against
 * months-old work, which is the more plausible story anyway.
 */
function seedRevokedByHierarchyChange(service: Service, submitter: Actor): void {
  const clockA = new Clock(daysAgo(60), 5);
  initiate(service, submitter, clockA, {
    project: "Coating Line Requalification",
    requestingDepartment: "Heat Shielding",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Dana Osei",
    requestingFinanceApprover: "Dana Osei",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 40,
    laborRate: 66,
  });

  const clockB = new Clock(daysAgo(58), 6);
  initiate(service, submitter, clockB, {
    project: "Coating Supplier Requalification",
    requestingDepartment: "Heat Shielding",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Dana Osei",
    requestingFinanceApprover: "Dana Osei",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 35,
    laborRate: 66,
  });

  service.setHierarchyNodeInactive(submitter, "department", department(service, "Heat Shielding"));
}

/** Left on hold, open - a "click me" so a live walkthrough has something to
 *  release and carry forward. */
function seedOpenOnHold(service: Service, submitter: Actor): void {
  const clock = new Clock(daysAgo(20), 7);
  const auth = initiate(service, submitter, clock, {
    project: "Rotor Balance Fixture Loan",
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 50,
    laborRate: 80,
  });

  service.acknowledge(participant(service, "Priya Anand"), auth.id, clock.step(6, 30));
  service.hold(submitter, auth.id, clock.step(4, 24));
}

/** Left awaiting correction, open - a second "click me" so a live
 *  walkthrough can resolve it in front of an audience. */
function seedOpenAwaitingCorrection(service: Service, submitter: Actor): void {
  const clock = new Clock(daysAgo(10), 8);
  const auth = initiate(service, submitter, clock, {
    project: "Duct Seal Kit Update",
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 70,
    laborRate: 74,
  });

  const priya = participant(service, "Priya Anand");
  service.acknowledge(priya, auth.id, clock.step(6, 30));
  service.acknowledge(priya, auth.id, clock.step(6, 30));

  const jordan = participant(service, "Jordan Hale");
  service.claim(jordan, auth.id, clock.step(4, 24));
  service.contribute(jordan, auth.id, { performingEmployee: "Tariq Byrne", ...clock.step(4, 30) });

  service.requestCorrection(participant(service, "Marcus Oduya"), auth.id, {
    fields: ["resources"],
    comment: "Budget hours look understated for the scope described - please revise.",
    ...clock.step(6, 30),
  });
}

/** Freshly initiated and untouched - a full walkthrough's starting line. */
function seedFreshlyInitiated(service: Service, submitter: Actor): void {
  const clock = new Clock(daysAgo(2), 9);
  initiate(service, submitter, clock, {
    project: "Hub Assembly Line Extension",
    requestingDepartment: "Rotor Assemblies",
    performingDepartment: "Flight Controls Software",
    fundingType: "company-funded",
    requestingLocationType: "domestic",
    performingLocationType: "domestic",
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    budgetHours: 150,
    laborRate: 90,
  });
}

/**
 * Seeds a body of synthetic authorizations with full, valid transition
 * histories (#65, ADR-0006) - initiations, arrivals, notifications,
 * correction requests, re-reviews, holds, referrals, revocations and mints,
 * spread over a plausible period ending safely before "now" so a live demo's
 * own clicking is always the newest activity in the log.
 */
export function seedAuthorizationHistory(service: Service): void {
  const submitter = participant(service, SUBMITTER_NAME);

  seedHappyPath(service, submitter);
  seedHappyPathWithReferral(service, submitter);
  seedCorrectionAndReReview(service, submitter);
  seedHoldReleaseWithdrawn(service, submitter);
  seedRevokedByHierarchyChange(service, submitter);
  seedOpenOnHold(service, submitter);
  seedOpenAwaitingCorrection(service, submitter);
  seedFreshlyInitiated(service, submitter);
}
