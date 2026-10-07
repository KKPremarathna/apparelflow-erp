import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const serverRoot = fileURLToPath(new URL("../", import.meta.url));

try {
  const demoEnv = dotenv.parse(
    fs.readFileSync(path.join(serverRoot, ".env"))
  );

  const testEnv = dotenv.parse(
    fs.readFileSync(path.join(serverRoot, ".env.test"))
  );

  // Our Supabase pooler username contains the project reference.
  function projectReference(connectionString) {
    const url = new URL(connectionString);

    if (!url.hostname.endsWith(".pooler.supabase.com")) {
      throw new Error("Expected a Supabase pooler connection URL.");
    }

    const username = decodeURIComponent(url.username);
    const prefix = "postgres.";

    if (!username.startsWith(prefix) || username.length === prefix.length) {
      throw new Error("Unable to identify the Supabase project.");
    }

    return username.slice(prefix.length);
  }

  const demoRefs = new Set([
    projectReference(demoEnv.DATABASE_URL),
    projectReference(demoEnv.DIRECT_URL),
  ]);

  const testRuntimeRef = projectReference(testEnv.DATABASE_URL);
  const testMigrationRef = projectReference(testEnv.DIRECT_URL);

  if (testRuntimeRef !== testMigrationRef) {
    throw new Error("Test database URLs point to different projects.");
  }

  if (demoRefs.has(testRuntimeRef)) {
    throw new Error("STOP: test URLs point to the demo database.");
  }

  if (testEnv.NODE_ENV !== "test" || !testEnv.JWT_SECRET) {
    throw new Error("NODE_ENV=test and JWT_SECRET are required.");
  }

  const commands = {
    migrate: [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
    ],
    seed: [
      "node_modules/prisma/build/index.js",
      "db",
      "seed",
    ],
    test: [
      "node_modules/vitest/vitest.mjs",
      "run",
    ],
  };

  const command = commands[process.argv[2]];

  if (!command) {
    throw new Error("Use: node scripts/test-env.js migrate|seed|test");
  }

  console.log("Safety check passed: using the separate test project.");

  const result = spawnSync(process.execPath, command, {
    cwd: serverRoot,
    env: {
      ...process.env,
      ...testEnv,
      NODE_ENV: "test",
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error("Test setup stopped:", error.message);
  process.exitCode = 1;
}