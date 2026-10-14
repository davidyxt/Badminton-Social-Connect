// Run only after starting local Supabase. Never provisions accounts in a hosted project.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adminDir = fileURLToPath(new URL("../", import.meta.url));
const repoDir = resolve(adminDir, "..");
const cwd = process.env.SUPABASE_WORKDIR || repoDir;
const bundledCli = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "BadmintonDevTools", "node_modules", ".bin", "supabase.cmd");
const cli = process.env.SUPABASE_CLI || (bundledCli && existsSync(bundledCli) ? bundledCli : "");
const command = process.platform === "win32"
  ? ["powershell.exe", ["-NoProfile", "-Command", "if ($env:ADMIN_LOCAL_CLI) { & $env:ADMIN_LOCAL_CLI status -o json } else { & npx.cmd --yes supabase status -o json }; if ($LASTEXITCODE) { exit $LASTEXITCODE }"]]
  : cli ? [cli, ["status", "-o", "json"]] : ["npx", ["--yes", "supabase", "status", "-o", "json"]];
const status = JSON.parse(execFileSync(...command, { cwd, encoding: "utf8", timeout: 30_000, env: { ...process.env, ADMIN_LOCAL_CLI: cli }, stdio: ["ignore", "pipe", "pipe"] }));
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(status.API_URL).hostname)) throw new Error("Refusing to configure a remote project with local demo credentials.");
if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Local Supabase keys are unavailable.");

async function auth(path, body, privileged = false) {
  const key = privileged ? status.SERVICE_ROLE_KEY : status.ANON_KEY;
  const response = await fetch(`${status.API_URL}/auth/v1/${path}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Local Auth request failed (${response.status}); credentials were not logged.`);
  return data;
}

const localDir = join(adminDir, ".local");
mkdirSync(localDir, { recursive: true });
const accountPath = join(localDir, "access.json");
let account;
if (existsSync(accountPath)) {
  account = JSON.parse(readFileSync(accountPath, "utf8"));
  if (account.supabaseUrl !== status.API_URL) throw new Error("Saved demo credentials belong to a different local stack. Keep them before setting up another stack.");
} else {
  const suffix = randomUUID().slice(0, 8);
  account = { supabaseUrl: status.API_URL, email: `admin-console-${suffix}@example.com`, password: `LocalAdmin9!${randomUUID()}`, playerId: null };
  const user = await auth("admin/users", {
    email: account.email, password: account.password, email_confirm: true, app_metadata: { role: "admin" },
    user_metadata: { username: `console_${suffix}`, date_of_birth: "2000-01-01", age_declared: true, terms_version: "2026-10", privacy_version: "2026-10", state: "VIC" },
  }, true);
  account.playerId = user.id;
  writeFileSync(accountPath, JSON.stringify(account, null, 2) + "\n", { mode: 0o600 });
}
const session = await auth("token?grant_type=password", { email: account.email, password: account.password });
if (session.user.app_metadata.role !== "admin") throw new Error("Saved demo account does not have the admin role.");
writeFileSync(join(adminDir, ".env.local"), `NEXT_PUBLIC_ADMIN_DATA_SOURCE=api\nNEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`);
writeFileSync(join(localDir, "access.txt"), `Local administrator demo account (local Supabase only)\nURL: http://localhost:3000\nEmail: ${account.email}\nPassword: ${account.password}\n\nSupabase: ${status.API_URL}\nKeep this file local. It contains no service-role key.\n`, { mode: 0o600 });
console.log("API mode configured and local administrator sign-in verified. Credentials are in admin/.local/access.txt (Git ignored).");
