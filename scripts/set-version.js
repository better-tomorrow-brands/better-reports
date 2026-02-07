const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", ".env.local");
const pkgPath = path.resolve(__dirname, "..", "package.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const version = `v${pkg.version}`;

let content = "";
if (fs.existsSync(envPath)) {
  content = fs.readFileSync(envPath, "utf-8");
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
console.log(`Set NEXT_PUBLIC_APP_VERSION=${version}`);
