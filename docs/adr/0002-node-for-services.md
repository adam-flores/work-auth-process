# Node for the services layer

**Status:** accepted

Services are Node (TypeScript). The deciding reason is that the validation and guidance
rules are the product: the same rule that tells a submitter "this field is required because
the charge crosses a legal entity" must also be enforced server-side before an authorization
is accepted. Sharing one language with the React front end (ADR-0001) lets those rules be
written once and executed in both places, rather than maintained twice in two languages and
drifting apart — which would reintroduce the exact inconsistency the project exists to
remove.

## Considered options

- **Python, .NET, or Java.** Any of these would serve a prototype of this size, and .NET or
  Java would be the more typical choice in a large aerospace manufacturer's IT estate. They
  were rejected only on the shared-rules argument above; this is not a claim that Node is
  the better fit for a real deployment. A production version inside the organization would
  likely revisit this against whatever its platform team already supports.

## Consequences

TypeScript is now the language of the repository, front and back. Any rule engine, schema,
or validation library chosen later should be usable in both the browser and the service —
that constraint is the whole point of this decision, and a library that only runs on the
server would undercut it.
