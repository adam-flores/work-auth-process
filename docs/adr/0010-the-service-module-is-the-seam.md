# The service is a module; HTTP is a thin adapter over it

**Status:** accepted

The spec places **one seam** for all process logic: the authorization service's command and query
API, driven in-process. This records the shape that makes that seam real rather than aspirational,
and it is the decision [ADR-0002](0002-node-for-services.md) deferred when it said any rule engine
or schema chosen later *"should be usable in both the browser and the service."*

**The service is a TypeScript module of typed functions, not an HTTP surface.** `initiate`,
`acknowledge`, `requestCorrection`, `correct`, `refer`, `claim`, `hold`, `withdraw`,
`mintChargeNumber`, `revoke` and the queries beside them are functions. Tests import them and drive
them against a real store on a temporary file.

**HTTP is an adapter with no logic in it.** A route parses a request, calls one function,
serializes what comes back, and maps a domain error to a status code. It does not branch on domain
state, consult the relay configuration, or decide what happens next. If a route handler ever needs
to know what stage an authorization is at, the thing it needs belongs in the module.

**One process serves both.** Node serves the built React assets and the HTTP adapter together, so a
cold clone runs one command and opens one URL. There is no second deployable and nothing to
provision — the same constraint that decided [ADR-0008](0008-sqlite-for-the-prototype-store.md).

**The acting participant is a parameter on every command, never a session.** Identity is mocked
throughout the prototype, and this is the concrete form that takes: the caller says who is acting.
It is what lets the fixture generator act as forty different people while writing seeded history,
and it is the single place a real build would replace with an authenticated principal.

**Validation is one rule set, imported by both sides.** Field rules are expressed once in a module
that depends on neither the DOM nor the store, and are imported by the React form for immediacy and
guidance and by the service as the actual control. The browser's copy is never the enforcement —
every command re-validates — but it is the *same* rules, which is the whole point of ADR-0002.
Zod satisfies the constraint and is named here for concreteness rather than committed to; a library
that ran only on the server would undercut the decision, and that is the part that matters.

## Considered options

- **HTTP as the test seam**, with logic tests driving routes over the wire. The higher seam, and
  rejected on two grounds. Every test of re-review or a gate condition would pay a server lifecycle
  and a serialization round-trip to assert something neither touches; and it quietly permits logic
  to accumulate in route handlers, where nothing else — the fixture generator especially — can
  reuse it. A seam should be the narrowest place everything passes through, and that is the module.

- **No HTTP at all: the front end imports the service directly.** Genuinely the simplest shape and
  the one to prefer if it worked. It does not: the store is a file
  ([ADR-0008](0008-sqlite-for-the-prototype-store.md)) and a browser cannot hold it, so a network
  boundary is forced whatever we would rather.

- **A separate API service and a separately served SPA.** The conventional production split.
  Rejected for the cold-clone constraint — two things to start is one more than a demonstration can
  afford — and it buys nothing here, since both halves are always deployed together.

## Consequences

**Route handlers are mechanical, and are not individually tested.** A thin adapter is allowed to be
thin. That the wire works end to end is covered by the Playwright tests, which exercise it by
necessity; that the logic is right is covered at the module, where it is cheap.

**The fixture generator uses the same functions the product does.**
[ADR-0006](0006-insights-from-seeded-transition-history.md) requires seeded transition sequences to
be *valid*, and this is what makes validity structural rather than asserted — the generator has no
way to write a sequence the product could not have produced, because it is calling the product.

**The store choice stays confined**, which is what ADR-0008 claims when it says nothing outside the
service module knows SQLite exists. That claim is only true while this ADR holds.

**Every command returns the authorization as folded, not a bare acknowledgement.** The front end
never maintains a parallel copy of derived state — position, whether a stage is awaiting
correction, whose queue something is in — because the fold is the only thing entitled to say.
