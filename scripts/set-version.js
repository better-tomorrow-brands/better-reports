const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env.local");

// On Vercel, git is in detached HEAD so use the env var
const branch =
  process.env.VERCEL_GIT_COMMIT_REF ||
  execSync("git branch --show-current", { encoding: "utf-8" }).trim();

const match = branch.match(/^(v\d+\.\d+\.\d+)/);
const version = match ? match[1] : "dev";

let content = "";
if (fs.existsSync(envPath)) {
  content = fs.readFileSync(envPath, "utf-8");
  // Replace existing line or append
  if (content.includes("NEXT_PUBLIC_APP_VERSION=")) {
    content = content.replace(
      /NEXT_PUBLIC_APP_VERSION=.*/,
      `NEXT_PUBLIC_APP_VERSION=${version}`
    );
  } else {
    content = content.trimEnd() + `\n\nNEXT_PUBLIC_APP_VERSION=${version}\n`;
  }
} else {
  content = `NEXT_PUBLIC_APP_VERSION=${version}\n`;
}

fs.writeFileSync(envPath, content);
console.log(`Set NEXT_PUBLIC_APP_VERSION=${version} (branch: ${branch})`);
