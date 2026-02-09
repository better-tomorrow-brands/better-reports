const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const pkgPath = path.resolve(__dirname, "..", "package.json");

function getVersionFromBranch(branch) {
  const match = branch.match(/v?(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function getVersionFromGitTags() {
  try {
    // Get the most recent version tag reachable from HEAD
    const tag = execSync("git describe --tags --match 'v*' --abbrev=0 2>/dev/null", { encoding: "utf-8" }).trim();
    const match = tag.match(/v?(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getVersionFromMergedBranch() {
  try {
    // Check the most recent merge commit message for a version
    const msg = execSync("git log --merges -1 --pretty=%s 2>/dev/null", { encoding: "utf-8" }).trim();
    const match = msg.match(/v?(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

let version = null;

// 1. Try current branch name
try {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  version = getVersionFromBranch(branch);
} catch {}

// 2. Try Vercel env var (branch/ref being built)
if (!version && process.env.VERCEL_GIT_COMMIT_REF) {
  version = getVersionFromBranch(process.env.VERCEL_GIT_COMMIT_REF);
}

// 3. Try git tags
if (!version) {
  version = getVersionFromGitTags();
}

// 4. Try most recent merge commit message
if (!version) {
  version = getVersionFromMergedBranch();
}

// 5. Fallback to package.json
if (!version) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  version = pkg.version;
}

// Always update package.json to keep it in sync
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
if (pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Updated package.json version to ${version}`);
}

console.log(`App version: v${version}`);
