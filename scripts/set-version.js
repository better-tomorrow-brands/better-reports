const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env.local");

function getVersionFromBranch(branch) {
  // Extract semver from branch name, e.g. "v1.0.9-amazon" → "1.0.9"
  const match = branch.match(/v?(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

let version = null;

// 1. Try git branch
try {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  version = getVersionFromBranch(branch);
} catch {}

// 2. Fallback: Vercel env var (branch name available in CI)
if (!version && process.env.VERCEL_GIT_COMMIT_REF) {
  version = getVersionFromBranch(process.env.VERCEL_GIT_COMMIT_REF);
}

// 3. Fallback: package.json
if (!version) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));
  version = pkg.version;
}

const versionStr = `v${version}`;

let content = "";
if (fs.existsSync(envPath)) {
  content = fs.readFileSync(envPath, "utf-8");
  if (content.includes("NEXT_PUBLIC_APP_VERSION=")) {
    content = content.replace(
      /NEXT_PUBLIC_APP_VERSION=.*/,
      `NEXT_PUBLIC_APP_VERSION=${versionStr}`
    );
  } else {
    content = content.trimEnd() + `\nNEXT_PUBLIC_APP_VERSION=${versionStr}\n`;
  }
} else {
  content = `NEXT_PUBLIC_APP_VERSION=${versionStr}\n`;
}

fs.writeFileSync(envPath, content);
console.log(`Set NEXT_PUBLIC_APP_VERSION=${versionStr} (from branch)`);
