import { spawnSync } from "node:child_process";

// Start fresh Node processes: changing TZ inside a Vitest worker does not
// reliably change jsdom/Intl's cached timezone. These are real host timezones.
const zones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

for (const zone of zones) {
  console.log(`\n=== Event date regressions: ${zone} ===`);
  for (const [workspace, files] of [
    ["api-server", ["src/routes/haas.test.ts"]],
    ["ourhaas", ["src/lib/haas.test.ts", "src/pages/events.test.tsx", "src/pages/admin.test.tsx"]],
  ]) {
    const result = spawnSync("pnpm", [
      "--filter", `@workspace/${workspace}`, "exec", "vitest", "run",
      ...files, "-t", "calendar|event dates",
    ], { stdio: "inherit", env: { ...process.env, TZ: zone } });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
