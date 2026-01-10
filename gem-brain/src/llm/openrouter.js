export async function callOpenRouterJSON(opts) {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      ...(opts.httpReferer ? { "HTTP-Referer": opts.httpReferer } : {}),
      ...(opts.xTitle ? { "X-Title": opts.xTitle } : {}),
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty content");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter did not return valid JSON");
  }
  return parsed;
}
