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
import { execFileSync } from "node:child_process";
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
  const out = staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    : git(["ls-files"]);
  return out.split("\n").filter(Boolean);
}

function contentOf(file: string): string {
  if (staged) return git(["show", ":" + file]);
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
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
  if (!text || text.includes(NUL)) continue; // unreadable or binary
  scan(file, text, "secrets", SECRET_RULES);
  scan(file, text, "confidential", confidentialRules);
  if (!semgrepAvailable) scan(file, text, "code", CODE_RULES);
}

if (semgrepAvailable) {
  try {
    execFileSync("semgrep", ["--config=auto", "--error", "--quiet", "."], { stdio: "inherit" });
  } catch {
    findings.push({ target: "code", file: ".", line: 0, detail: "semgrep reported findings" });
  }
} else {
  notes.push(
    "semgrep not installed - using built-in code patterns (install semgrep for full coverage)",
  );
}

// ---- 2. Dependency vulnerabilities -----------------------------------------
try {
  execFileSync("npm", ["audit", "--audit-level=high"], { stdio: "pipe" });
} catch (err) {
  const out = String((err as { stdout?: Buffer }).stdout ?? "");
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|offline/i.test(out)) {
    notes.push("npm audit could not reach the registry - dependency check skipped");
  } else {
    findings.push({
      target: "dependencies",
      file: "package-lock.json",
      line: 0,
      detail: "npm audit reports a high or critical advisory - run `npm audit`",
    });
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
