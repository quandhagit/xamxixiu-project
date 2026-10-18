import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const yarnCommand =
  process.platform === "win32" ? "yarn.cmd" : "yarn";
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

const checks = [
  {
    name: "renderer build and type-check",
    command: "renderer:build"
  },
  {
    name: "Electron TypeScript build",
    command: "electron:build"
  }
];

console.log("Quality Gate");
console.log("============");
console.log(
  "Unavailable checks: lint, unit tests, integration tests " +
  "(no corresponding package scripts are defined)."
);

console.log("\n[RUN] asset-policy");
const policy = spawnSync(
  process.execPath,
  [path.join(currentDirectory, "asset-policy.mjs")],
  { stdio: "inherit", shell: false }
);
if (policy.error) {
  console.error(`[FAIL] asset-policy: ${policy.error.message}`);
  process.exit(1);
}
if (policy.status !== 0) {
  console.error(
    `[FAIL] asset-policy exited with code ${policy.status ?? 1}.`
  );
  process.exit(policy.status ?? 1);
}
console.log("[PASS] asset-policy");

for (const check of checks) {
  console.log(`\n[RUN] yarn ${check.command} (${check.name})`);
  const command =
    process.platform === "win32"
      ? process.env.ComSpec ?? "cmd.exe"
      : yarnCommand;
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `${yarnCommand} ${check.command}`]
      : [check.command];
  const result = spawnSync(
    command,
    args,
    {
      stdio: "inherit",
      shell: false
    }
  );

  if (result.error) {
    console.error(
      `[FAIL] ${check.command}: ${result.error.message}`
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    const code = result.status ?? 1;
    console.error(
      `[FAIL] ${check.command} exited with code ${code}.`
    );
    process.exit(code);
  }

  console.log(`[PASS] ${check.command}`);
}

console.log("\nQuality Gate passed.");
