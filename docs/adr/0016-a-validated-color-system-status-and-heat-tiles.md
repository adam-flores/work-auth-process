# A validated color system: status badges and Insights' heat tiles

**Status:** accepted
**Amends:** [ADR-0014](0014-hand-built-charts-for-insights.md) - the per-stage breakdown's own
form, not its "no charting library" decision, which stands unchanged

Feedback on a walkthrough: the per-stage breakdown's stacked progress bars were flagged as visually
flat, and the app overall was flagged as needing "additional color variation... an industrial,
modern, professional palette." This is a design change, not a data or process one, so it went
through the `dataviz` skill's procedure - form before color, color validated by computation, never
eyeballed - rather than picking colors by taste.

**The per-stage breakdown became a heat-tile grid, not a bar list.** ADR-0014's own considered
options already ruled out a charting library for this screen; that holds. What changed is the mark:
`StageChartRow` (`InsightsDashboard.tsx`) now renders one colored tile per stage in a responsive
grid, its fill one of five fixed steps of a single blue ramp (`--seq-0..4`, `styles.css`) chosen by
that stage's share of the slowest stage's time - darker tile, more time. The dataviz skill's own
form guidance (`choosing-a-form.md`) calls this **ordinal**, not sequential: the stages are a real
sequence, but what's being colored is magnitude, and every one of the eight relay stages is a real,
always-meaningful data point - never a near-zero cell that should recede toward the surface the way
a true sequential heatmap's low end is allowed to. The five steps (not eight, not the sequential
ramp's full ten) are the largest count that clears `validate_palette.js --ordinal`'s adjacent-
lightness gate in both modes; every finer spacing tried failed it (see `styles.css`'s own comment
on `--seq-0..4`). Text ink per tile was computed from the skill's own `contrast()` export, not
judged by eye, and set per level *in CSS*, not by a rule the component derives - light mode's
level 3 and dark mode's level 3 are different hexes (the two ramps don't share a step count against
the same lightness band), so a single mode-agnostic ink cutoff gets one of them backwards. Both
ramps' three lighter steps read with dark ink and their two darker steps with white, but which
*level number* that split falls at is a property of each mode's own ramp, not a constant.

**Status color reaches the places that were already showing state as plain text or a flat gray
badge.** Three reserved hexes (`--status-good/warning/critical`, straight from the dataviz skill's
documented palette - it also names a fourth, "serious", left out since nothing in this app's state
model needs it yet) now color: a queue item's "Claimed" badge (good) and its correction flag
(warning, not `--error` critical - a correction is actionable by the viewer, not a system failure);
the master dashboard's "Completed" (good) and "Revoked" (critical) stage badges; and the demo
player's own status badge (`running` good, `paused` warning, `finished` a separate info hue so it
never reads as "still going"). Every one of these already paired the color with a text label before
this change (never color alone), so the skill's own status-collision rule - status color always
ships with an icon-or-label - was already satisfied; this only gave the label a color to also read
by. `--accent-info` (violet) is a separate, deliberately distinct hue for "notable, not good-or-bad"
flags (re-review) - the collision rule again: a flag that isn't good or bad news doesn't wear
status tokens.

**Status colors ship as filled chips, not colored text, because they fail as text on this app's own
surfaces.** `warning` measures 1.7:1 as plain text against this app's light page background -
illegible, not just borderline. Computed with the same `contrast()` export
(`scripts/validate_palette.js`) rather than assumed: each status hex became a badge's *background*
instead, with dark or white ink chosen per hex by whichever clears 4.5:1 against that specific fill
(good/warning read with dark ink; critical, the one hex where ink drops to 4.1:1, reads with white).
`--accent-info` needed none of this - it clears 8.05:1 (light) / 5.19:1 (dark) as plain text, so it
kept the existing outlined-pill badge style.

**Neutral chrome, `--accent`, and the "no charting library" decision are all unchanged.** This adds
a status/info/ordinal layer on top of the existing steel-blue accent and grayscale chrome, rather
than re-deriving the app's whole visual identity - the existing palette already read as the
"industrial, modern, professional" character asked for; what it lacked was anywhere for state to
show up in anything but gray or the one accent blue.

## Considered options

- **Recolor the per-stage breakdown's existing bars by magnitude, keep the bar form.** Rejected -
  the request was specifically that the bars themselves were visually flat; recoloring a bar chart
  doesn't change its form, and the dataviz skill's own guidance names a colored grid as a legitimate
  alternative for exactly this job (ordered-category magnitude).

- **A full categorical palette across the app** (the dataviz skill's eight-hue categorical set, one
  hue per section or role). Rejected - nothing in this app has eight *identities* that need telling
  apart at a glance; the actual gaps were state (status) and one ordered magnitude chart (ordinal).
  Categorical color for decoration alone is exactly what the skill's "color comes last, and only for
  a job" procedure argues against.

- **Colored text for the new status badges**, matching `.badge-attention`'s prior pattern. Rejected
  once measured: two of the four status hexes are illegible as text on this app's light surface.
  A filled chip was the smallest change that keeps every status hex in the documented palette
  unmodified while staying legible.

## Consequences

**Every new color traces to a documented hex and a computed check**, the same discipline ADR-0014
already held charts to: nothing here was eyeballed, and `styles.css`'s own comments carry the
`validate_palette.js` invocations and results that justified each choice, so a future edit can
re-run them rather than re-derive them from scratch.

**A tile's level is quantized, not continuous** - five fixed CSS custom properties, not an
interpolated color no variable holds - which is what keeps the "documented palette only" rule
(dataviz skill, `color-formula.md` check 6) true of a value driven by live data rather than a fixed
list.
