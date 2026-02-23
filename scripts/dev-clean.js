/**
 * Clean .next (and optionally node_modules), npm install with optional deps, then start dev server.
 * Cross-platform (Node built-ins only). Runs check-node and doctor first.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const fullClean = process.argv.includes("--full");

// Preflight: Node version
require("./check-node.js");

// Doctor: omit config and lightningcss binaries (fail fast)
const { run: doctorRun } = require("./doctor.js");
if (!doctorRun()) {
  process.exit(1);
}

function rmDirIfExists(dir) {
  const full = path.join(repoRoot, dir);
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true });
    console.log("Removed " + dir);
  }
}

function rmFileIfExists(file) {
  const full = path.join(repoRoot, file);
  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
    console.log("Removed " + file);
  }
}

process.chdir(repoRoot);

rmDirIfExists(".next");
if (fullClean) {
  rmDirIfExists("node_modules");
  rmFileIfExists("package-lock.json");
}

console.log("Running npm install (with optional deps)...");
execSync("npm install --include=optional", { stdio: "inherit", shell: true });

console.log("Starting dev server (Turbopack)...");
execSync("npx next dev", { stdio: "inherit", shell: true });
