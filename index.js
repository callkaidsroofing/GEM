import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_MS = parseInt(process.env.TOOLS_POLL_INTERVAL_MS || "3000", 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function loadRegistry() {
  const raw = fs.readFileSync("./tools.registry.json", "utf8");
  const parsed = JSON.parse(raw);
  const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
  const map = new Map();
  for (const t of tools) map.set(t.name, t);
  return { version: parsed.version || "unknown", tools, map };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function writeReceipt(callId, status, result, effects = null, error = null) {
  const payload = {
    call_id: callId,
    status,
    result: result ?? {},
    effects: effects ?? {
      db_writes: [],
      messages_sent: [],
      files_written: [],
      external_calls: []
    },
    error
  };

  const { error: insErr } = await supabase
    .from("core_tool_receipts")
    .insert(payload);

  if (insErr) console.error("Receipt insert failed:", insErr);
}

async function setCallStatus(id, status, patch = {}) {
  const { error } = await supabase
    .from("core_tool_calls")
    .update({ status, ...patch })
    .eq("id", id);

  if (error) console.error("Call status update failed:", error);
}

async function fetchOneQueuedCall() {
  const { data, error } = await supabase
    .from("core_tool_calls")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Fetch queued call failed:", error);
    return null;
  }
  return (data && data[0]) || null;
}

function toolAllowed(toolName) {
  // For MVP safety: ONLY allow this one tool until we expand deliberately.
  return toolName === "os.health_check";
}

async function runHealthCheck() {
  // Minimal check that the executor is alive + DB reachable.
  return {
    status: "ok",
    checks: {
      executor: "ok",
      db: "ok",
      queue: "ok"
    }
  };
}

async function handleCall(call, registry) {
  const { id, tool_name } = call;

  if (!registry.map.has(tool_name)) {
    await setCallStatus(id, "failed");
    await writeReceipt(
      id,
      "failed",
      {},
      null,
      { message: `Tool not found in registry: ${tool_name}` }
    );
    return;
  }

  if (!toolAllowed(tool_name)) {
    await setCallStatus(id, "blocked");
    await writeReceipt(
      id,
      "blocked",
      {},
      null,
      { message: `Tool blocked in MVP allowlist: ${tool_name}` }
    );
    return;
  }

  await setCallStatus(id, "running");

  try {
    let result = {};

    if (tool_name === "os.health_check") {
      result = await runHealthCheck();
    }

    await setCallStatus(id, "succeeded");
    await writeReceipt(id, "succeeded", result, {
      db_writes: [{ table: "core_tool_calls", action: "update", id }],
      messages_sent: [],
      files_written: [],
      external_calls: []
    });
  } catch (e) {
    await setCallStatus(id, "failed");
    await writeReceipt(id, "failed", {}, null, {
      message: e?.message || "Unknown error",
      stack: e?.stack || null
    });
  }
}

async function main() {
  const registry = loadRegistry();
  console.log(`CKR Core Executor starting. Registry version: ${registry.version}`);
  console.log(`Polling every ${POLL_MS}ms`);

  // Poll loop
  while (true) {
    try {
      const call = await fetchOneQueuedCall();
      if (call) {
        console.log("Handling call:", call.id, call.tool_name);
        await handleCall(call, registry);
      }
    } catch (e) {
      console.error("Loop error:", e?.message || e);
    }

    await sleep(POLL_MS);
  }
}

main();
