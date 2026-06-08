#!/usr/bin/env node
/**
 * CI / release guard: production deploys must configure a strong AUTH_SECRET.
 * Run in GitHub Actions with CI=true and AUTH_SECRET from secrets.
 */
import { execFileSync } from "node:child_process";

const isCi = process.env.CI === "true";
if (!isCi) process.exit(0);

const s = process.env.AUTH_SECRET;
if (typeof s !== "string" || s.trim().length < 32) {
  console.error(
    "check-prod-env: In CI, AUTH_SECRET must be set and at least 32 characters (openssl rand -base64 32).",
  );
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
}

// Guardrail: never commit real env files.
const trackedEnv = git(["ls-files", "-z", "--", ".env*", "**/.env*"])
  .split("\0")
  .filter(Boolean)
  .filter((p) => !p.endsWith("/.env.example") && p !== ".env.example");
if (trackedEnv.length) {
  console.error("check-prod-env: tracked env files found (must not be committed):");
  for (const p of trackedEnv) console.error(`- ${p}`);
  process.exit(1);
}

// Guardrail: basic secret signature scan over tracked files.
const secretPatterns = [
  "sb_secret_",
  "-----BEGIN PRIVATE KEY-----",
  "AUTH_GOOGLE_SECRET=",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET=",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "SUPABASE_JWT_SECRET=",
  "INTERNAL_AI_SECRET=",
];
for (const pat of secretPatterns) {
  try {
    const out = git([
      "grep",
      "-n",
      "-I",
      "-E",
      pat,
      "--",
      ".",
      ":(exclude)scripts/check-prod-env.mjs",
      ":(exclude).env.example",
      ":(exclude)backend/.env.example",
      ":(exclude)docs",
      ":(exclude)README.md",
      ":(exclude)product-development-plan.md",
    ]).trim();
    if (out) {
      console.error(`check-prod-env: potential secret match for pattern: ${pat}`);
      console.error(out);
      process.exit(1);
    }
  } catch {
    // No matches returns exit code 1, which throws here.
  }
}

process.exit(0);
