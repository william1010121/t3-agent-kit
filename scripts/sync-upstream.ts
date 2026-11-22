// Copies the upstream T3 Code files listed in upstream.json into this repo, then
// applies the local fixes in upstream-patches/*.patch on top.
// Usage: node scripts/sync-upstream.ts [--commit <sha>] [--check]
import * as ChildProcess from "node:child_process";
import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

interface PackageMapping {
  readonly from: string;
  readonly to: string;
  readonly paths: ReadonlyArray<string>;
  readonly into?: string;
}

interface UpstreamConfig {
  repository: string;
  commit: string;
  readonly rewrites: Record<string, string>;
  readonly packages: ReadonlyArray<PackageMapping>;
}

const root = Path.resolve(import.meta.dirname, "..");
const configPath = Path.join(root, "upstream.json");
const config: UpstreamConfig = JSON.parse(FS.readFileSync(configPath, "utf8"));

const args = process.argv.slice(2);
const commitFlag = args.indexOf("--commit");
const commit = commitFlag === -1 ? config.commit : args[commitFlag + 1];
const check = args.includes("--check");
if (commit === undefined) throw new Error("--commit needs a value");

const cacheDir = Path.join(root, ".upstream");
const git = (...gitArgs: string[]) =>
  ChildProcess.execFileSync("git", gitArgs, { cwd: cacheDir, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();

if (!FS.existsSync(Path.join(cacheDir, ".git"))) {
  FS.mkdirSync(cacheDir, { recursive: true });
  git("init", "--quiet");
  git("remote", "add", "origin", config.repository);
}
git("fetch", "--quiet", "--depth", "1", "origin", commit);
git("-c", "advice.detachedHead=false", "checkout", "--quiet", "--force", "FETCH_HEAD");
const resolved = git("rev-parse", "HEAD");

// Longest specifiers first, so a subpath rewrite wins over its package rewrite.
const rewrites = Object.entries(config.rewrites).sort(([a], [b]) => b.length - a.length);
const rewrite = (source: string) =>
  source.replace(/(from\s+|import\s*\(\s*|vi\.mock\(\s*)(["'])([^"']+)\2/g, (match, lead, quote, specifier) => {
    for (const [from, to] of rewrites) {
      if (specifier === from || specifier.startsWith(`${from}/`)) {
        return `${lead}${quote}${to}${specifier.slice(from.length)}${quote}`;
      }
    }
    return match;
  });

const isText = (file: string) => /\.(ts|tsx|mts|cts|js|mjs|json|md)$/.test(file);
const staging = FS.mkdtempSync(Path.join(OS.tmpdir(), "t3-agent-kit-sync-"));
process.on("exit", () => FS.rmSync(staging, { recursive: true, force: true }));
const staged: string[] = [];

const stage = (source: string, target: string) => {
  const stat = FS.statSync(source);
  if (stat.isDirectory()) {
    for (const entry of FS.readdirSync(source)) stage(Path.join(source, entry), Path.join(target, entry));
    return;
  }
  const raw = FS.readFileSync(source);
  const output = isText(source) ? Buffer.from(rewrite(raw.toString("utf8"))) : raw;
  FS.mkdirSync(Path.dirname(Path.join(staging, target)), { recursive: true });
  FS.writeFileSync(Path.join(staging, target), output);
  staged.push(target);
};

for (const mapping of config.packages) {
  const destination = Path.join(mapping.to, mapping.into ?? "");
  for (const entry of mapping.paths) {
    stage(Path.join(cacheDir, mapping.from, entry), Path.join(destination, entry));
  }
}

const patchesDir = Path.join(root, "upstream-patches");
const patches = FS.existsSync(patchesDir)
  ? FS.readdirSync(patchesDir).filter((file) => file.endsWith(".patch")).sort()
  : [];
for (const patch of patches) {
  ChildProcess.execFileSync("git", ["apply", "--whitespace=nowarn", Path.join(patchesDir, patch)], {
    cwd: staging,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

if (!check) {
  for (const mapping of config.packages) {
    const destination = Path.join(root, mapping.to, mapping.into ?? "");
    for (const entry of mapping.paths) FS.rmSync(Path.join(destination, entry), { recursive: true, force: true });
  }
}

const drift: string[] = [];
for (const file of staged) {
  const output = FS.readFileSync(Path.join(staging, file));
  const target = Path.join(root, file);
  const current = FS.existsSync(target) ? FS.readFileSync(target) : undefined;
  if (current !== undefined && current.equals(output)) continue;
  drift.push(file);
  if (check) continue;
  FS.mkdirSync(Path.dirname(target), { recursive: true });
  FS.writeFileSync(target, output);
}

if (check) {
  if (drift.length > 0) {
    console.error(`Vendored files differ from upstream ${resolved} plus ${patches.length} patch(es):\n  ${drift.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Vendored files match upstream ${resolved} plus ${patches.length} patch(es).`);
} else {
  config.commit = resolved;
  FS.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${drift.length} file(s) from upstream ${resolved} plus ${patches.length} patch(es).`);
}
