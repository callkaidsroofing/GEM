import { callOpenRouterJSON } from "./openrouter.js";

export async function parseIntentWithOpenRouter({ message, toolShortlist, env }) {
  const apiKey = env.OPENROUTER_API_KEY;
  const model = env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
  const baseUrl = env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const httpReferer = env.OPENROUTER_HTTP_REFERER;
  const xTitle = env.OPENROUTER_X_TITLE;

  if (!apiKey || apiKey.includes("PASTE_YOUR_KEY_HERE")) {
    return { intent: "refuse", reason: "OPENROUTER_API_KEY not set", missing: ["OPENROUTER_API_KEY"], tool_candidates: [] };
  }

  const system = [
    "You are GEM Brain Intent Parser.",
    "You output ONLY valid JSON, no prose.",
    "You do NOT invent fields. You do NOT guess values.",
    "If unsure, return intent='refuse' with reason and missing fields.",
    "",
    "Return JSON with keys:",
    "intent: string",
    "tool_candidates: string[]",
    "args: object",
    "confidence: number (0..1) optional",
    "notes: string optional",
    "If refusing: intent='refuse', reason, missing[], tool_candidates[].",
  ].join("\n");

  const user = JSON.stringify({ message, tools: toolShortlist }, null, 2);

  const parsed = await callOpenRouterJSON({
    apiKey,
    model,
    baseUrl,
    system,
    user,
    httpReferer,
    xTitle,
  });

  if (!parsed || typeof parsed !== "object" || !parsed.intent) {
    return { intent: "refuse", reason: "LLM returned invalid artefact (missing intent)", tool_candidates: [], missing: ["intent"] };
  }

  if (parsed.intent !== "refuse") {
    if (!Array.isArray(parsed.tool_candidates)) {
      return { intent: "refuse", reason: "LLM returned invalid artefact (tool_candidates not array)", tool_candidates: [], missing: ["tool_candidates[]"] };
    }
    if (!parsed.args || typeof parsed.args !== "object") {
      return { intent: "refuse", reason: "LLM returned invalid artefact (args not object)", tool_candidates: parsed.tool_candidates || [], missing: ["args"] };
    }
  }

  return parsed;
}
