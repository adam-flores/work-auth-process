#!/usr/bin/env node
/**
 * The scan SEC-5 requires, enforced by the blocking pre-commit hook SEC-6 asks
 * for. Four distinct targets, all of which run on every commit:
 *
 *   1. secrets in the diff
 *   2. dependency vulnerabilities
 *   3. code-level vulnerabilities
 *   4. export-controlled or confidential content
 *
 * Run over staged content with `--staged` (what the hook does), or over the
 * whole working tree with no arguments.
 *
 * On the fourth target: the list of terms that must never be committed is
 * itself sensitive - a scanner that hardcodes the client's name defeats the
 * rule it enforces. So the built-in patterns are generic, and site-specific
 * terms go one-per-line in `.security-terms`, which is gitignored.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type Finding = { target: string; file: string; line: number; detail: string };

const staged = process.argv.includes("--staged");
const findings: Finding[] = [];
const notes: string[] = [];
const SELF = "scripts/security-scan.ts";
const NUL = String.fromCharCode(0);

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
}

function filesToScan(): string[] {
  // -z is not optional: without it git quotes any path outside ASCII
  // (core.quotePath), the quoted name does not resolve, and the file is skipped
  // - which would let a secret through in a file nobody could see was unscanned.
  const out = staged
    ? git(["diff", "--cached", "-z", "--name-only", "--diff-filter=ACMR"])
    : git(["ls-files", "-z"]);
  return out.split(NUL).filter(Boolean);
}

/** null means "could not be read", which is a finding rather than a pass. */
function contentOf(file: string): string | null {
  try {
    return staged
      ? execFileSync("git", ["show", ":" + file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      : readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function scan(file: string, text: string, target: string, rules: [RegExp, string][]): void {
  const lines = text.split("\n");
  for (const [pattern, detail] of rules) {
    lines.forEach((line, i) => {
      if (pattern.test(line)) findings.push({ target, file, line: i + 1, detail });
    });
  }
}

// ---- 1. Secrets ------------------------------------------------------------
const SECRET_RULES: [RegExp, string][] = [
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "GitHub token"],
  [/\bsk-[A-Za-z0-9]{20,}\b/, "API secret key"],
  [/-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, "private key block"],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@/, "credentials in a connection string"],
  [
    /(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    "hardcoded credential",
  ],
];

// ---- 3. Code-level vulnerabilities -----------------------------------------
// Used when semgrep is not installed. Modest by design: it catches the shapes
// that matter in this stack rather than pretending to be a full ruleset.
const CODE_RULES: [RegExp, string][] = [
  [/\beval\s*\(/, "eval()"],
  [/new\s+Function\s*\(/, "new Function()"],
  [/\bexecSync\s*\(\s*[`"'][^`"']*\$\{/, "shell command built by interpolation"],
  [/\.(query|exec|prepare)\s*\(\s*[`"'][^`"']*\$\{/, "SQL built by interpolation - use a parameter"],
  [/\bdangerouslySetInnerHTML\b/, "dangerouslySetInnerHTML"],
  [/readFileSync\s*\(\s*(?:req|request)\./, "file path taken straight from a request"],
];

// ---- 4. Confidential / export-controlled content ---------------------------
const CONFIDENTIAL_RULES: [RegExp, string][] = [
  [/\b(?:ITAR|EAR99|ECCN\s*[0-9][A-Z0-9]*)\b/i, "export-control marking"],
  [/\b(?:CUI|PROPRIETARY\s+INFORMATION|COMPANY\s+CONFIDENTIAL)\b/, "confidentiality marking"],
  [/\bcage\s*code\s*[:=]?\s*[0-9A-Z]{5}\b/i, "CAGE code"],
  [/\bcontract\s*(?:no\.?|number|#)\s*[:=]?\s*[A-Z0-9-]{6,}/i, "contract number"],
];

function localTermRules(): [RegExp, string][] {
  if (!existsSync(".security-terms")) {
    notes.push(
      "no .security-terms file - site-specific names (the client, programs, people) are not checked",
    );
    return [];
  }
  return readFileSync(".security-terms", "utf8")
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith("#"))
    .map((term): [RegExp, string] => [
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      "term listed in .security-terms",
    ]);
}

// ---- Run -------------------------------------------------------------------
const files = filesToScan();
const confidentialRules = [...CONFIDENTIAL_RULES, ...localTermRules()];
const semgrepAvailable = (() => {
  try {
    execFileSync("semgrep", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

for (const file of files) {
  if (file === SELF) continue; // every rule appears in this file by definition
  const text = contentOf(file);
  if (text === null) {
    findings.push({
      target: "secrets",
      file,
      line: 0,
      detail: "could not be read, so it was not scanned - refusing to pass it",
    });
    continue;
  }
  if (text.includes(NUL)) continue; // binary
  scan(file, text, "secrets", SECRET_RULES);
  scan(file, text, "confidential", confidentialRules);
  if (!semgrepAvailable) scan(file, text, "code", CODE_RULES);
}

if (semgrepAvailable) {
  // Scan exactly what the other three targets scan, so `git add -p` does not
  // produce a report about code that is not being committed.
  const targets = files.length > 0 ? files : ["."];
  const run = spawnSync("semgrep", ["--config=auto", "--error", "--quiet", ...targets], {
    encoding: "utf8",
  });
  if (run.error) {
    notes.push("semgrep could not be run (" + run.error.message + ") - code check skipped");
  } else if (run.status === 1) {
    findings.push({ target: "code", file: ".", line: 0, detail: "semgrep reported findings" });
    if (run.stdout) console.error(run.stdout);
  } else if (run.status !== 0) {
    // 2, 7 and 8 are semgrep's own failures - a missing ruleset offline, most
    // often. A tool that could not run has found nothing, and saying otherwise
    // would train everyone to ignore the hook.
    notes.push("semgrep exited " + run.status + " without scanning - code check skipped");
  }
} else {
  notes.push(
    "semgrep not installed - using built-in code patterns (install semgrep for full coverage)",
  );
}

// ---- 2. Dependency vulnerabilities -----------------------------------------
{
  // Ask for JSON and read the counts, rather than inferring an advisory from a
  // non-zero exit: npm exits non-zero when it cannot reach the registry or
  // there is no lockfile, and reporting those as vulnerabilities would block
  // every offline commit with a claim that is not true.
  const run = spawnSync("npm", ["audit", "--json", "--audit-level=high"], { encoding: "utf8" });
  const parsed = ((): { metadata?: { vulnerabilities?: Record<string, number> }; error?: unknown } | null => {
    try {
      return JSON.parse(run.stdout) as { metadata?: { vulnerabilities?: Record<string, number> } };
    } catch {
      return null;
    }
  })();

  if (run.error || parsed === null || parsed.error) {
    notes.push("npm audit could not complete (offline, or no lockfile) - dependency check skipped");
  } else {
    const counts = parsed.metadata?.vulnerabilities ?? {};
    const serious = (counts["high"] ?? 0) + (counts["critical"] ?? 0);
    if (serious > 0) {
      findings.push({
        target: "dependencies",
        file: "package-lock.json",
        line: 0,
        detail: serious + " high or critical advisory(ies) - run `npm audit`",
      });
    }
  }
}

// ---- Report ----------------------------------------------------------------
for (const note of notes) console.warn("  note: " + note);

if (findings.length === 0) {
  const n = files.length;
  console.log("  security scan clean (" + n + " file" + (n === 1 ? "" : "s") + ")");
  process.exit(0);
}

console.error("\n  SECURITY SCAN FAILED - " + findings.length + " finding(s)\n");
for (const f of findings) {
  console.error("  [" + f.target + "] " + f.file + (f.line ? ":" + f.line : "") + " - " + f.detail);
}
console.error("\n  Fix these before committing. To override a genuine false positive:");
console.error("    git commit --no-verify   (and say so in the commit message)\n");
process.exit(1);
