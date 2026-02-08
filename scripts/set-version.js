const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const pkgPath = path.resolve(__dirname, "..", "package.json");

function getVersionFromBranch(branch) {
  const match = branch.match(/v?(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

let version = null;

// 1. Try git branch
try {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  version = getVersionFromBranch(branch);
} catch {}

// 2. Fallback: Vercel env var
if (!version && process.env.VERCEL_GIT_COMMIT_REF) {
  version = getVersionFromBranch(process.env.VERCEL_GIT_COMMIT_REF);
}

// If we found a version from the branch, update package.json so it persists after merge to master
if (version) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`Updated package.json version to ${version}`);
  }
} else {
  // No version in branch name — use package.json as-is
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  version = pkg.version;
}

console.log(`App version: v${version}`);
