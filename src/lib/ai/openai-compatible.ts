type CompletionOptions = {
  system: string;
  user: string;
  temperature?: number;
};

function getConfig() {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("Falta AI_API_KEY en .env.local");
  }

  return { apiKey, baseUrl, model };
}

function extractJsonBlock(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1);
}

function safeParseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    const extracted = extractJsonBlock(value);
    if (!extracted) throw new Error("La IA no devolvió JSON válido.");
    return JSON.parse(extracted) as T;
  }
}

async function executeRequest(body: Record<string, unknown>) {
  const { apiKey, baseUrl } = getConfig();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Error del proveedor IA (${response.status}): ${raw}`);
  }

  return JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
}

export async function createJsonCompletion<T>({ system, user, temperature = 0.6 }: CompletionOptions) {
  const { model } = getConfig();

  const basePayload = {
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  let data: { choices?: Array<{ message?: { content?: string } }> };

  try {
    data = await executeRequest({
      ...basePayload,
      response_format: { type: "json_object" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("response_format")) {
      throw error;
    }

    data = await executeRequest(basePayload);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("La IA no devolvió contenido.");
  }

  return {
    parsed: safeParseJson<T>(content),
    model,
  };
}
