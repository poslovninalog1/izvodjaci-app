/**
 * Verify environment and lightningcss installation.
 * Run: npm run doctor
 * Fails with recovery steps if optional deps were omitted or lightningcss binaries missing.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const nodeModules = path.join(repoRoot, "node_modules");

function getNpmOmit() {
  try {
    return execSync("npm config get omit", { encoding: "utf8", shell: true }).trim();
  } catch {
    return "(unknown)";
  }
}

function getExpectedLightningcssPackage() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") {
    return "lightningcss-win32-" + arch + "-msvc";
  }
  if (platform === "darwin") {
    return "lightningcss-darwin-" + arch;
  }
  if (platform === "linux") {
    return "lightningcss-linux-" + arch + "-gnu";
  }
  return "lightningcss-" + platform + "-" + arch;
}

function run() {
  let ok = true;

  console.log("Node version:  ", process.version);
  console.log("npm version:   ", execSync("npm -v", { encoding: "utf8", shell: true }).trim());
  const omit = getNpmOmit();
  console.log("npm omit:      ", omit === "undefined" || omit === "" ? "(none)" : omit);

  if (omit && omit !== "undefined" && omit !== "''" && omit.toLowerCase().includes("optional")) {
    console.error("\n\u274c npm is omitting optional dependencies. lightningcss platform binaries will not be installed.");
    console.error("   Fix: npm config delete omit");
    ok = false;
  }

  const lightningcssRoot = path.join(nodeModules, "lightningcss");
  const expectedPkg = getExpectedLightningcssPackage();
  const platformPkg = path.join(nodeModules, expectedPkg);

  if (!fs.existsSync(lightningcssRoot)) {
    console.error("\n\u274c node_modules/lightningcss not found. Run: npm install");
    ok = false;
  } else if (!fs.existsSync(platformPkg)) {
    console.error("\n\u274c Platform package not found: " + expectedPkg);
    console.error("   This usually means optional deps were skipped (omit=optional).");
    ok = false;
  } else {
    console.log("lightningcss:  OK (" + expectedPkg + " present)");
  }

  if (!ok) {
    console.error("\n--- Recovery (Windows PowerShell) ---");
    console.error("npm config delete omit");
    console.error("Remove-Item -Recurse -Force node_modules, package-lock.json, .next -ErrorAction SilentlyContinue");
    console.error("npm install --include=optional");
    console.error("npm run dev");
    console.error("--------------------------------------\n");
    if (require.main === module) process.exit(1);
    return false;
  }

  console.log("\n\u2705 Environment OK. You can run: npm run dev");
  if (require.main === module) process.exit(0);
  return true;
}

if (require.main === module) run();
module.exports = { run, getNpmOmit, getExpectedLightningcssPackage };
