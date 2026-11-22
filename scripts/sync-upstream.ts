// Copies the upstream T3 Code files listed in upstream.json into this repo.
// Usage: node scripts/sync-upstream.ts [--commit <sha>] [--check]
import * as ChildProcess from "node:child_process";
import * as FS from "node:fs";
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
const drift: string[] = [];

const copy = (source: string, target: string) => {
  const stat = FS.statSync(source);
  if (stat.isDirectory()) {
    for (const entry of FS.readdirSync(source)) copy(Path.join(source, entry), Path.join(target, entry));
    return;
  }
  const raw = FS.readFileSync(source);
  const output = isText(source) ? Buffer.from(rewrite(raw.toString("utf8"))) : raw;
  const current = FS.existsSync(target) ? FS.readFileSync(target) : undefined;
  if (current !== undefined && current.equals(output)) return;
  drift.push(Path.relative(root, target));
  if (check) return;
  FS.mkdirSync(Path.dirname(target), { recursive: true });
  FS.writeFileSync(target, output);
};

for (const mapping of config.packages) {
  const destination = Path.join(root, mapping.to, mapping.into ?? "");
  if (!check) {
    for (const entry of mapping.paths) FS.rmSync(Path.join(destination, entry), { recursive: true, force: true });
  }
  for (const entry of mapping.paths) {
    copy(Path.join(cacheDir, mapping.from, entry), Path.join(destination, entry));
  }
}

if (check) {
  if (drift.length > 0) {
    console.error(`Vendored files differ from upstream ${resolved}:\n  ${drift.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Vendored files match upstream ${resolved}.`);
} else {
  config.commit = resolved;
  FS.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Copied ${drift.length} file(s) from upstream ${resolved}.`);
}
