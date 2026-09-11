# React for the front end

**Status:** accepted

The core lever this project is betting on is guidance at the point of entry: the business
case frames the failure mode as knowledge access, not employee unwillingness
(`docs/business-case.md` §3, §10). That means the form has to be interactive — per-field help that
appears as a field is focused, conditional sections that appear only when they apply,
validation that fires before submission rather than after an approver rejects it. We are
building that UI in React.

## Considered options

- **Server-rendered templates with progressive enhancement.** Simpler to stand up, but the
  interaction we actually care about — inline, per-field, conditional guidance — becomes the
  hard part rather than the easy part.
- **A low-code form or workflow builder.** Fastest path to a working form, but the guidance
  behavior is the thesis of the project, and it would be constrained by whatever the tool
  allows. It also makes the prototype harder to demonstrate as our own design work.

## Consequences

React is a rendering choice, not a full stack decision. The build tooling and any framework
on top of it (Vite, Next.js, or plain React) stay open and are cheap to change later; they
do not need an ADR.
