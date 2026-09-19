import type { Service } from "../service/index.ts";

/**
 * The fixed story a demo run tells (#94). A Contributor submits an
 * authorization naming a department other than their own; it advances
 * through the requesting side's Approver; the performing side's Approver
 * raises a correction request; the Contributor who claimed it corrects the
 * flagged field in place, not by a new submission (BDR-0005); the same
 * Approver resumes exactly where they left it; the remaining stages
 * acknowledge through to Completed, skipping both gates (company-funded,
 * domestic on both sides). Every step calls a real service command - the
 * runner can never drift from what the product can actually do (ADR-0010).
 *
 * The participants and departments are the demo roster (#92,
 * `config/participants.json`, `docs/reference/demo-hierarchy.json`): Jordan
 * Hale is the only seeded Contributor, at Flight Controls Software; Priya
 * Anand is the only seeded Approver at Rotor Assemblies; Marcus Oduya is the
 * only seeded Approver at Flight Controls Software; Elin Vasquez is the
 * only seeded Charge Number Admin.
 */

const CONTRIBUTOR_ID = "p-jordan-hale";
const REQUESTING_APPROVER_ID = "p-priya-anand";
const PERFORMING_APPROVER_ID = "p-marcus-oduya";
const CHARGE_NUMBER_ADMIN_ID = "p-elin-vasquez";

const REQUESTING_DEPARTMENT_NAME = "Rotor Assemblies";
const PERFORMING_DEPARTMENT_NAME = "Flight Controls Software";

/** Carries the one thing later steps need but cannot know ahead of time -
 *  the id `initiateDraft` mints for the authorization the rest of the
 *  script acts on. Nothing else varies run to run: every other value the
 *  script needs is fixed in the step that uses it. */
export type DemoContext = {
  authorizationId: string | null;
};

export function createDemoContext(): DemoContext {
  return { authorizationId: null };
}

export type DemoStep = {
  /** Which tab the presenter's screen switches to for this step (#94: "the
   *  demo automatically switch[es] tabs ... as the story requires"). */
  readonly tabId: string;
  /** Which participant the "Acting as" switcher shows while this step runs -
   *  the concrete form ADR-0010's mocked identity takes, driven by the
   *  script instead of a click. */
  readonly actingId: string;
  /** What the presenter (and the audience, reading over their shoulder)
   *  should understand just happened. */
  readonly narration: string;
  /** The service command this step calls, with its arguments - the same
   *  function a live user's click would call (ADR-0010). Mutates `ctx` only
   *  to record the authorization id the first step mints. */
  readonly run: (service: Service, ctx: DemoContext) => void;
};

function requireAuthorizationId(ctx: DemoContext): string {
  if (ctx.authorizationId === null) {
    throw new Error("No authorization has been initiated yet - step 1 must run first.");
  }
  return ctx.authorizationId;
}

/** Built fresh per runner rather than held as one shared array - `run` calls
 *  into a `Service` bound to whichever store that runner was constructed
 *  with, and nothing here holds state of its own between calls other than
 *  what `DemoContext` carries. */
export function buildDemoScript(): DemoStep[] {
  return [
    {
      tabId: "submit",
      actingId: CONTRIBUTOR_ID,
      narration:
        "Jordan Hale, a Contributor in Flight Controls Software, submits an authorization naming " +
        "Rotor Assemblies as the requesting department.",
      run(service, ctx) {
        const departments = service.searchDepartments({ participantId: CONTRIBUTOR_ID });
        const requesting = departments.find((d) => d.name === REQUESTING_DEPARTMENT_NAME);
        const performing = departments.find((d) => d.name === PERFORMING_DEPARTMENT_NAME);
        if (!requesting || !performing) {
          throw new Error("The demo catalog no longer names the departments this script depends on.");
        }
        const draft = service.createDraft(
          { participantId: CONTRIBUTOR_ID },
          {
            project: "Rotor telemetry integration",
            requestingDepartmentId: requesting.id,
            performingDepartmentId: performing.id,
            fundingType: "company-funded",
            requestingLocationType: "domestic",
            performingLocationType: "domestic",
            requestingProgramManager: "Dana Ferris",
            requestingFinanceApprover: "Kim Osei",
            performingProgramManager: "Lior Amsel",
            performingFinanceApprover: "Priya Nandan",
          },
        );
        service.addResource({ participantId: CONTRIBUTOR_ID }, draft.id, { budgetHours: 40, laborRate: 85.5 });
        const authorization = service.initiateDraft({ participantId: CONTRIBUTOR_ID }, draft.id);
        ctx.authorizationId = authorization.id;
      },
    },
    {
      tabId: "my-queue",
      actingId: REQUESTING_APPROVER_ID,
      narration: "Priya Anand, the requesting-side Approver, acknowledges the program-manager stage.",
      run(service, ctx) {
        service.acknowledge({ participantId: REQUESTING_APPROVER_ID }, requireAuthorizationId(ctx));
      },
    },
    {
      tabId: "my-queue",
      actingId: REQUESTING_APPROVER_ID,
      narration: "Priya Anand acknowledges the requesting-side finance stage.",
      run(service, ctx) {
        service.acknowledge({ participantId: REQUESTING_APPROVER_ID }, requireAuthorizationId(ctx));
      },
    },
    {
      tabId: "my-queue",
      actingId: CONTRIBUTOR_ID,
      narration: "Jordan Hale claims the authorization for Flight Controls Software.",
      run(service, ctx) {
        service.claim({ participantId: CONTRIBUTOR_ID }, requireAuthorizationId(ctx));
      },
    },
    {
      tabId: "my-queue",
      actingId: CONTRIBUTOR_ID,
      narration: "Jordan Hale names the employee performing the work - typing the name in a hurry.",
      run(service, ctx) {
        service.contribute({ participantId: CONTRIBUTOR_ID }, requireAuthorizationId(ctx), {
          performingEmployee: "Sam Riddley",
        });
      },
    },
    {
      tabId: "my-queue",
      actingId: PERFORMING_APPROVER_ID,
      narration:
        "Marcus Oduya, the performing-side Approver, catches the typo and raises a correction request.",
      run(service, ctx) {
        service.requestCorrection({ participantId: PERFORMING_APPROVER_ID }, requireAuthorizationId(ctx), {
          fields: ["performingEmployee"],
          comment: 'The employee\'s name is misspelled - it should be "Ridley," not "Riddley."',
        });
      },
    },
    {
      tabId: "my-queue",
      actingId: CONTRIBUTOR_ID,
      narration: "Jordan Hale corrects the employee's name in place - not a new submission (BDR-0005).",
      run(service, ctx) {
        service.correct({ participantId: CONTRIBUTOR_ID }, requireAuthorizationId(ctx), {
          performingEmployee: "Sam Ridley",
        });
      },
    },
    {
      tabId: "my-queue",
      actingId: PERFORMING_APPROVER_ID,
      narration: "Marcus Oduya resumes exactly where he left off and acknowledges.",
      run(service, ctx) {
        service.acknowledge({ participantId: PERFORMING_APPROVER_ID }, requireAuthorizationId(ctx));
      },
    },
    {
      tabId: "my-queue",
      actingId: PERFORMING_APPROVER_ID,
      narration:
        "Marcus Oduya acknowledges the performing-side finance stage. Company-funded, domestic-to-domestic " +
        "work skips both gates.",
      run(service, ctx) {
        service.acknowledge({ participantId: PERFORMING_APPROVER_ID }, requireAuthorizationId(ctx));
      },
    },
    {
      tabId: "my-queue",
      actingId: CHARGE_NUMBER_ADMIN_ID,
      narration: "Elin Vasquez, the Charge Number Admin, mints the charge number and completes the authorization.",
      run(service, ctx) {
        service.mintChargeNumber({ participantId: CHARGE_NUMBER_ADMIN_ID }, requireAuthorizationId(ctx), {
          chargeNumber: "CN-DEMO-0001",
        });
      },
    },
    {
      tabId: "insights",
      actingId: CHARGE_NUMBER_ADMIN_ID,
      narration: "Insights updates live: the completed authorization is reflected immediately.",
      run() {
        // Nothing to call - the point of this last beat is watching the
        // dashboard the previous step already changed, not changing
        // anything further.
      },
    },
  ];
}
