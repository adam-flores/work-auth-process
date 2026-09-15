import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../../src/service/index.ts";
import { DomainError } from "../../src/service/errors.ts";
import { withTempStore } from "../helpers/temp-store.ts";

/**
 * Permissibility at entry (#53, BDR-0007): a foreign department may not
 * perform work for a domestic one, checked the moment both departments are
 * set on a draft rather than days later at a gate. The rule list itself is
 * configurable by an Administrator (ADR-0011) and is exercised here through
 * the same service seam every other command uses.
 */

const SYSTEM = { participantId: "system" };

describe("permissibility", () => {
  let store: ReturnType<typeof withTempStore>;
  let service: ReturnType<typeof createService>;
  let submitter: string;
  let administrator: { participantId: string };
  let contributor: { participantId: string };
  let domesticId: string;
  let foreignId: string;
  let secondDomesticId: string;

  before(() => {
    store = withTempStore();
    service = createService({ storePath: store.path });
    const people = service.listParticipants(SYSTEM);
    submitter = people[0]!.id;
    administrator = { participantId: people.find((p) => p.role === "Administrator")!.id };
    contributor = { participantId: people.find((p) => p.role === "Contributor")!.id };

    const domestic = service.searchDepartments(SYSTEM, {
      attributes: [{ name: "jurisdiction", value: "domestic" }],
    });
    const foreign = service.searchDepartments(SYSTEM, {
      attributes: [{ name: "jurisdiction", value: "foreign" }],
    });
    domesticId = domestic[0]!.id;
    secondDomesticId = domestic[1]!.id;
    foreignId = foreign[0]!.id;
  });
  after(() => {
    service.close();
    store.cleanup();
  });

  test("the rule list is seeded with one rule: foreign may not perform for domestic", () => {
    const rules = service.listPermissibilityRules(SYSTEM);
    assert.equal(rules.length, 1);
    assert.equal(rules[0]!.requestingJurisdiction, "domestic");
    assert.equal(rules[0]!.performingJurisdiction, "foreign");
  });

  test("a foreign department performing for a domestic one is refused on create", () => {
    assert.throws(
      () =>
        service.createDraft(
          { participantId: submitter },
          { requestingDepartmentId: domesticId, performingDepartmentId: foreignId },
        ),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal(err.code, "IMPERMISSIBLE_PAIRING");
        assert.match(err.message, /not a permitted pairing/);
        return true;
      },
    );
  });

  test("the refusal names the pairing, not either department's capability", () => {
    try {
      service.createDraft(
        { participantId: submitter },
        { requestingDepartmentId: domesticId, performingDepartmentId: foreignId },
      );
      assert.fail("expected a refusal");
    } catch (err) {
      assert.ok(err instanceof DomainError);
      assert.doesNotMatch(err.message.toLowerCase(), /cannot|incapable|unable/);
    }
  });

  test("the same pairing is refused on save, not only on create", () => {
    const draft = service.createDraft(
      { participantId: submitter },
      { requestingDepartmentId: domesticId },
    );
    assert.throws(
      () =>
        service.updateDraft({ participantId: submitter }, draft.id, {
          requestingDepartmentId: domesticId,
          performingDepartmentId: foreignId,
        }),
      (err: unknown) => err instanceof DomainError && err.code === "IMPERMISSIBLE_PAIRING",
    );
  });

  test("the reverse pairing - domestic performing for foreign - is permitted", () => {
    const draft = service.createDraft(
      { participantId: submitter },
      { requestingDepartmentId: foreignId, performingDepartmentId: domesticId },
    );
    assert.equal(draft.requestingDepartmentId, foreignId);
    assert.equal(draft.performingDepartmentId, domesticId);
  });

  test("two departments sharing a jurisdiction are always a permitted pairing", () => {
    const draft = service.createDraft(
      { participantId: submitter },
      { requestingDepartmentId: domesticId, performingDepartmentId: secondDomesticId },
    );
    assert.equal(draft.performingDepartmentId, secondDomesticId);
  });

  test("the check does not run until both departments are set", () => {
    const draft = service.createDraft(
      { participantId: submitter },
      { requestingDepartmentId: domesticId },
    );
    assert.equal(draft.performingDepartmentId, null);
  });

  test("an Administrator adds a pairing, and it takes effect immediately", () => {
    const added = service.addPermissibilityRule(administrator, {
      requestingJurisdiction: "foreign",
      performingJurisdiction: "domestic",
    });
    assert.equal(added.requestingJurisdiction, "foreign");
    assert.equal(added.performingJurisdiction, "domestic");
    assert.ok(service.listPermissibilityRules(SYSTEM).some((r) => r.id === added.id));

    assert.throws(
      () =>
        service.createDraft(
          { participantId: submitter },
          { requestingDepartmentId: foreignId, performingDepartmentId: domesticId },
        ),
      (err: unknown) => err instanceof DomainError && err.code === "IMPERMISSIBLE_PAIRING",
    );

    // Undo, so this test does not leak into the ones around it.
    service.removePermissibilityRule(administrator, added.id);
  });

  test("only an Administrator may add or remove a pairing - reading the list stays open", () => {
    assert.throws(
      () =>
        service.addPermissibilityRule(contributor, {
          requestingJurisdiction: "foreign",
          performingJurisdiction: "domestic",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_ADMINISTRATOR",
    );

    const seeded = service.listPermissibilityRules(SYSTEM)[0]!;
    assert.throws(
      () => service.removePermissibilityRule(contributor, seeded.id),
      (err: unknown) => err instanceof DomainError && err.code === "NOT_ADMINISTRATOR",
    );

    // Unaffected by either refusal.
    assert.equal(service.listPermissibilityRules(contributor).length, 1);
  });

  test("adding a pairing already on the list is a no-op, not a duplicate", () => {
    const first = service.listPermissibilityRules(SYSTEM)[0]!;
    const again = service.addPermissibilityRule(administrator, {
      requestingJurisdiction: first.requestingJurisdiction,
      performingJurisdiction: first.performingJurisdiction,
    });
    assert.equal(again.id, first.id);
    assert.equal(service.listPermissibilityRules(SYSTEM).length, 1);
  });

  test("an Administrator removes a pairing, and the departments it named become permitted", () => {
    const seeded = service.listPermissibilityRules(SYSTEM)[0]!;
    const result = service.removePermissibilityRule(administrator, seeded.id);
    assert.deepEqual(result, { deleted: true });
    assert.equal(service.listPermissibilityRules(SYSTEM).length, 0);

    const draft = service.createDraft(
      { participantId: submitter },
      { requestingDepartmentId: domesticId, performingDepartmentId: foreignId },
    );
    assert.equal(draft.performingDepartmentId, foreignId);

    // Restore the seeded rule so later tests (and reseeding elsewhere) are unaffected.
    service.addPermissibilityRule(administrator, {
      requestingJurisdiction: seeded.requestingJurisdiction,
      performingJurisdiction: seeded.performingJurisdiction,
    });
  });

  test("removing an unknown rule is refused", () => {
    assert.throws(
      () => service.removePermissibilityRule(administrator, "permissibility-rule-nope"),
      (err: unknown) => err instanceof DomainError && err.code === "UNKNOWN_PERMISSIBILITY_RULE",
    );
  });

  test("an invalid jurisdiction value is refused", () => {
    assert.throws(
      () =>
        service.addPermissibilityRule(administrator, {
          requestingJurisdiction: "domestic",
          performingJurisdiction: "overseas",
        }),
      (err: unknown) => err instanceof DomainError && err.code === "INVALID_REQUEST",
    );
  });

  test("resetting the store restores the seeded rule", () => {
    service.removePermissibilityRule(administrator, service.listPermissibilityRules(SYSTEM)[0]!.id);
    assert.equal(service.listPermissibilityRules(SYSTEM).length, 0);

    service.resetStore(SYSTEM);
    const rules = service.listPermissibilityRules(SYSTEM);
    assert.equal(rules.length, 1);
    assert.equal(rules[0]!.requestingJurisdiction, "domestic");
    assert.equal(rules[0]!.performingJurisdiction, "foreign");
  });
});
