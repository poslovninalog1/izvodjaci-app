/**
 * Preflight: enforce Node 20 or 22 LTS.
 * Node 24+ breaks Tailwind v4 (lightningcss native bindings).
 * Run before dev, build, and install.
 */
const major = parseInt(process.version.slice(1).split(".")[0], 10);

if (major < 20) {
  console.error(
    "\n\u274c Node " +
      process.version +
      " is too old. This project requires Node 20 or 22 LTS.\n" +
      "   Install Node 22 LTS: https://nodejs.org/\n"
  );
  process.exit(1);
}

if (major >= 23) {
  console.error(
    "\n\u274c You are on Node " +
      process.version +
      ". This project requires Node 20 or 22 LTS.\n" +
      "   Tailwind v4 (lightningcss) does not support Node 24+ and will fail with \"Cannot find module 'unknown'\".\n\n" +
      "   Windows (no nvm): Install Node 22 LTS from https://nodejs.org/ (MSI).\n" +
      "   Windows (nvm):   Install nvm-windows, then: nvm install 22 && nvm use 22\n" +
      "   Mac/Linux:       nvm install 22 && nvm use 22\n\n" +
      "   Then run: node -v  (must show v22.x.x) and re-run your command.\n"
  );
  process.exit(1);
}
