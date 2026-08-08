import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const versions = JSON.parse(readFileSync(new URL("versions.json", root), "utf8"));

const failures = [];
if (manifest.version !== pkg.version) failures.push("manifest.json and package.json versions differ");
if (versions[manifest.version] !== manifest.minAppVersion) {
  failures.push("versions.json does not map the release version to minAppVersion");
}

for (const asset of ["main.js", "manifest.json", "styles.css"]) {
  try {
    readFileSync(new URL(asset, root));
  } catch {
    failures.push(`missing release asset: ${asset}`);
  }
}

const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean);

const identityLog = execFileSync("git", ["log", "--all", "--format=%ae%n%ce"], {
  cwd: root,
  encoding: "utf8",
});
if (/@[^\n>]*\.local\b/i.test(identityLog)) {
  failures.push("Git history contains a machine-local author or committer identity");
}

const checks = [
  ["macOS absolute user path", new RegExp("/" + "Users/", "i")],
  ["Linux absolute home path", new RegExp("/" + "home/[a-z0-9._-]+/", "i")],
  ["private Tailscale hostname", new RegExp("[a-z0-9.-]+\\." + "ts\\.net", "i")],
  ["private vault name", new RegExp("Cobb" + "Vault2", "i")],
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["private-key block", new RegExp("BEGIN [A-Z ]*" + "PRIVATE KEY")],
  ["GitHub token", new RegExp("gh" + "[opsu]_[A-Za-z0-9]{20,}")],
  ["OpenAI-style secret", new RegExp("sk" + "-[A-Za-z0-9_-]{20,}")],
  ["Slack token", new RegExp("xox" + "[abprs]-[A-Za-z0-9-]{20,}")],
  ["Google API key", new RegExp("AI" + "za[0-9A-Za-z_-]{30,}")],
  ["Google OAuth secret", new RegExp("GOC" + "SPX-[0-9A-Za-z_-]{20,}")],
  ["Telegram bot token", new RegExp("\\b\\d{8,10}:" + "[A-Za-z0-9_-]{30,}\\b")],
  ["assigned credential", /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+-]{12,}/i],
];

for (const file of tracked) {
  let contents;
  try {
    contents = readFileSync(new URL(file, root), "utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of checks) {
    if (pattern.test(contents)) failures.push(`${file}: ${label}`);
  }
}

// Self-test seam (dd-20260807-3x3e): prove the scanner actually catches a
// synthetic private path and a machine-local Git identity, without either
// value ever existing verbatim in this repository (built by concatenation).
if (process.argv.includes("--self-test")) {
  const plantedPath = ["/U", "sers/someone/Secret", "Vault/note.md"].join("");
  const plantedIdentity = ["someone@laptop", ".local"].join("");
  const pathHit = checks.some(([, pattern]) => pattern.test(plantedPath));
  const identityHit = /@[^\n>]*\.local\b/i.test(plantedIdentity);
  if (!pathHit || !identityHit) {
    console.error(`Self-test FAILED: private path caught=${pathHit}, local identity caught=${identityHit}`);
    process.exit(1);
  }
  console.log("Self-test passed: synthetic private path and machine-local identity both fail the gate.");
  process.exit(0);
}

if (failures.length) {
  console.error("Release check failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Release check passed for Media Log ${manifest.version} (${tracked.length} tracked files scanned).`);
