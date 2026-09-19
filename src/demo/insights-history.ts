import type { Service } from "../service/index.ts";

/**
 * A small, purpose-built body of historical data for the demo's Insights
 * tab (#94 follow-up), distinct from the general-purpose fixture
 * `src/fixtures/authorization-history.ts` already seeds for local
 * development (`npm run reset`). That fixture covers every transition kind
 * ADR-0006 names - referrals, corrections, holds, revocations, open work -
 * which makes M1-M3 harder to read at a glance and leaves a couple of
 * items sitting in a live queue the moment Reset finishes. This seeds
 * exactly five completed authorizations and nothing else: every queue
 * stays empty, and M2's average cycle time reads as a clean, explainable
 * number instead of a mix of unrelated scenarios.
 *
 * Five authorizations, each with its own fixed total cycle time - 3, 6, 7,
 * 8, and 8 days - averaging 6.4 days, close to the requested "about a
 * week." An exact 7.0-day average is not reachable together with a value
 * as low as 3 days once every individual value is capped at 8 (the
 * request's own upper bound): with five values in [3, 8], hitting a mean
 * of 7 forces every value but the lowest to sit at the 8-day ceiling,
 * which reads as mechanically repetitive rather than like five distinct
 * requests. Spread across the stated 3-8 day band was judged more useful
 * for a demo audience than an exact 7.0 average.
 *
 * Every transition is spaced evenly across each authorization's own total
 * duration (`evenSteps` below) rather than randomly, the same
 * deterministic-and-reviewable spirit as picking the five totals directly:
 * nothing here needs to look organically noisy, only to add up to a
 * specific, stated number.
 */

type Actor = { participantId: string };

const SYSTEM: Actor = { participantId: "system" };
const SUBMITTER_ID = "p-teo-brandt";
const REQUESTING_APPROVER_ID = "p-priya-anand";
const PERFORMING_APPROVER_ID = "p-marcus-oduya";
const CONTRIBUTOR_ID = "p-jordan-hale";
const CHARGE_NUMBER_ADMIN_ID = "p-elin-vasquez";

const REQUESTING_DEPARTMENT_NAME = "Rotor Assemblies";
const PERFORMING_DEPARTMENT_NAME = "Flight Controls Software";

function department(service: Service, name: string): string {
  const found = service.searchDepartments(SYSTEM).find((d) => d.name === name);
  if (!found) throw new Error(`Insights history fixture: no department named "${name}".`);
  return found.id;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** `count` timestamps, evenly spaced across `totalDays` starting from
 *  `startAt` - the six stage-resolving transitions after initiation (two
 *  requesting acknowledgements, a contribution, two performing
 *  acknowledgements, and a mint - `claim` is deliberately not one of these;
 *  see its own call site) each land `totalDays / count` apart, so the last
 *  one - completion - falls exactly `totalDays` after `startAt`. */
function evenSteps(startAt: Date, totalDays: number, count: number): string[] {
  const stepMs = (totalDays * 24 * 60 * 60 * 1000) / count;
  const timestamps: string[] = [];
  let t = startAt.getTime();
  for (let i = 0; i < count; i += 1) {
    t += stepMs;
    timestamps.push(new Date(t).toISOString());
  }
  return timestamps;
}

type Scenario = {
  project: string;
  totalDays: number;
  /** How many days ago this authorization completed - staggered per
   *  scenario so all five don't land on top of each other, and always
   *  comfortably before "now" (ADR-0006's "the demo's own clicking is
   *  always the newest activity in the log", equally true of the
   *  script's own scripted run). */
  completedDaysAgo: number;
  requestingProgramManager: string;
  requestingFinanceApprover: string;
  performingProgramManager: string;
  performingFinanceApprover: string;
  performingEmployee: string;
  chargeNumber: string;
  budgetHours: number;
  laborRate: number;
};

const SCENARIOS: Scenario[] = [
  {
    project: "Landing Gear Bracket Refresh",
    totalDays: 3,
    completedDaysAgo: 4,
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    performingEmployee: "Nora Kessler",
    chargeNumber: "CN-HIST-0001",
    budgetHours: 45,
    laborRate: 82,
  },
  {
    project: "Avionics Wiring Harness Update",
    totalDays: 6,
    completedDaysAgo: 9,
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    performingEmployee: "Devon Okafor",
    chargeNumber: "CN-HIST-0002",
    budgetHours: 110,
    laborRate: 88,
  },
  {
    project: "Hydraulic Line Inspection Support",
    totalDays: 7,
    completedDaysAgo: 15,
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    performingEmployee: "Ines Marchetti",
    chargeNumber: "CN-HIST-0003",
    budgetHours: 150,
    laborRate: 79,
  },
  {
    project: "Cabin Door Seal Replacement",
    totalDays: 8,
    completedDaysAgo: 21,
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    performingEmployee: "Tariq Byrne",
    chargeNumber: "CN-HIST-0004",
    budgetHours: 95,
    laborRate: 91,
  },
  {
    project: "Engine Mount Fastener Audit",
    totalDays: 8,
    completedDaysAgo: 28,
    requestingProgramManager: "Priya Anand",
    requestingFinanceApprover: "Priya Anand",
    performingProgramManager: "Marcus Oduya",
    performingFinanceApprover: "Marcus Oduya",
    performingEmployee: "Sam Ridgeway",
    chargeNumber: "CN-HIST-0005",
    budgetHours: 130,
    laborRate: 85,
  },
];

function seedScenario(service: Service, requestingDeptId: string, performingDeptId: string, scenario: Scenario): void {
  const startAt = daysAgo(scenario.completedDaysAgo + scenario.totalDays);
  // Six even slices, not seven: `claim` doesn't resolve a stage (only
  // `contribute` does - `RESOLVING_KINDS` in `authorizations/index.ts`), so
  // giving it its own slice would silently fold that slice into
  // "performing-department"'s attributed time, doubling it relative to
  // every other stage. `claimAt` instead lands at the midpoint of the
  // ack2 -> contribute window it needs to fall inside, without consuming a
  // slice of its own - every one of the six real stage-resolving
  // boundaries stays an equal totalDays/6 apart.
  const [ack1, ack2, contributeAt, ack3, ack4, mintAt] = evenSteps(startAt, scenario.totalDays, 6) as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const claimAt = new Date((new Date(ack2).getTime() + new Date(contributeAt).getTime()) / 2).toISOString();

  const draft = service.createDraft(
    { participantId: SUBMITTER_ID },
    {
      project: scenario.project,
      requestingDepartmentId: requestingDeptId,
      performingDepartmentId: performingDeptId,
      fundingType: "company-funded",
      requestingLocationType: "domestic",
      performingLocationType: "domestic",
      requestingProgramManager: scenario.requestingProgramManager,
      requestingFinanceApprover: scenario.requestingFinanceApprover,
      performingProgramManager: scenario.performingProgramManager,
      performingFinanceApprover: scenario.performingFinanceApprover,
    },
  );
  service.addResource(
    { participantId: SUBMITTER_ID },
    draft.id,
    { budgetHours: scenario.budgetHours, laborRate: scenario.laborRate },
  );
  const authorization = service.initiateDraft({ participantId: SUBMITTER_ID }, draft.id, {
    occurredAt: startAt.toISOString(),
  });

  service.acknowledge({ participantId: REQUESTING_APPROVER_ID }, authorization.id, { occurredAt: ack1 });
  service.acknowledge({ participantId: REQUESTING_APPROVER_ID }, authorization.id, { occurredAt: ack2 });
  service.claim({ participantId: CONTRIBUTOR_ID }, authorization.id, { occurredAt: claimAt });
  service.contribute({ participantId: CONTRIBUTOR_ID }, authorization.id, {
    performingEmployee: scenario.performingEmployee,
    occurredAt: contributeAt,
  });
  service.acknowledge({ participantId: PERFORMING_APPROVER_ID }, authorization.id, { occurredAt: ack3 });
  service.acknowledge({ participantId: PERFORMING_APPROVER_ID }, authorization.id, { occurredAt: ack4 });
  service.mintChargeNumber({ participantId: CHARGE_NUMBER_ADMIN_ID }, authorization.id, {
    chargeNumber: scenario.chargeNumber,
    occurredAt: mintAt,
  });
}

/** Seeds the five completed authorizations described above. Every field
 *  goes through the same command surface a live user's click would
 *  (ADR-0010) - the generator has no way to write a sequence the product
 *  could not have produced. */
export function seedInsightsHistory(service: Service): void {
  const requestingDeptId = department(service, REQUESTING_DEPARTMENT_NAME);
  const performingDeptId = department(service, PERFORMING_DEPARTMENT_NAME);
  for (const scenario of SCENARIOS) {
    seedScenario(service, requestingDeptId, performingDeptId, scenario);
  }
}
