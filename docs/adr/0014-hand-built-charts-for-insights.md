# Hand-built charts for Insights, no charting library

**Status:** accepted

[Issue #93](https://github.com/adam-flores/work-auth-process/issues/93) asks for the Insights
dashboard's headline measures and per-stage breakdown to render as stat tiles and a bar chart
instead of a definition list and a table, so a demo audience reads the argument at a glance rather
than reading numbers off a page. `computeMeasures` (`src/measures/index.ts`) is unchanged — this
is presentation-only, the same split [ADR-0001](0001-react-for-the-front-end.md) drew between a
rendering choice and a full-stack decision.

**The charts are hand-built HTML and CSS — a labeled progress-bar pattern for the per-stage
breakdown, plain large text for the three stat tiles — rather than a charting library.** The
amount of charting this issue asks for is three stat tiles and one small per-stage bar chart with
a single series (magnitude only; nothing on this screen needs identity, polarity, or a second
scale). That is well inside what plain markup and this app's existing CSS custom properties
(`--accent`, `--ink`, `--muted`, `--line`, `--raised`) already do without a new dependency.

**Every number a chart shows is also plain visible text**, not a pixel-only value in an SVG or
canvas and not a separate screen-reader-only copy of it. A stat tile's large number *is* the
text node an assistive technology reads; a stage's bar is a decorative, `aria-hidden` sibling next
to the text that states its value in words (`"3.2 d across 12 visits"`). This satisfies the
issue's requirement that every value stay readable by assistive technology and assertable in
Playwright as text, without maintaining a second copy of any number that could drift from the
first.

## Considered options

- **A charting library** (e.g. a small React charting package). Rejected per the issue's own
  implementation decision: this prototype depends on nothing but `react`, `react-dom`, and `zod`,
  and three stat tiles plus one small bar chart do not justify a new dependency, its bundle
  weight, or a new API surface to learn, for a chart with one series and eight categories.

- **Inline SVG bars.** Considered and functionally equivalent to the div-based bars actually
  built — same one-hue, magnitude-only encoding, same relay-sequence ordering. Plain HTML/CSS
  was chosen over hand-rolled SVG because the accessible value is *already* a real text node
  right next to the bar rather than requiring an SVG `<title>` or `aria-label` to carry it, and
  because a `<div>` bar needs no viewBox/coordinate-system bookkeeping for eight rows whose only
  job is a proportional width.

- **A stacked or grouped bar splitting first-pass from re-review per stage**, keeping the old
  table's occurrence-level granularity as a second visual series. Rejected because the issue asks
  for "one entry per stage" and a second color series would need a legend and a categorical
  palette for information a demo audience does not need mid-chart; the re-review time is not
  dropped, though — it still gets its own visible text line under any stage that has it, so
  BDR-0006's "the days it costs stay attached to the stage that found it" still holds, just as
  text rather than as a second bar.

## Consequences

**The per-stage chart aggregates the two occurrence buckets `computeMeasures` keeps separate**
(first-pass and re-review) into one bar's length and visit count per stage, ordered by
`RELAY_CONFIG`'s own sequence rather than sorted by value. `computeMeasures` itself is untouched;
only `InsightsDashboard.tsx` folds the two occurrence rows it already receives.

**No new categorical palette, so no palette validation was needed.** The chart's only visual
channel is magnitude (bar length), encoded in the single `--accent` hue the app already uses for
every other interactive affordance; there is no second series to distinguish by color, so none of
this repository's existing tokens needed to change to accommodate the chart.

**A future chart with more than one series** (comparing two measures at once, or splitting by a
dimension a demo audience does care about) would need a real categorical palette and the
color-vision-deficiency checks that come with one; that is out of scope here and deferred to
whichever issue first needs it.
