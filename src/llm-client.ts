import { USER_AGENT } from "./constants.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionResponse {
  choices: {
    message: {
      role: "assistant";
      content?: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export async function callLLM(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  tools: LLMToolDef[],
  timeoutMs: number,
): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };

  if (tools.length > 0) {
    body["tools"] = tools;
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LLM request failed with status ${response.status}: ${text}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const choice = data.choices[0];

  if (!choice) {
    throw new Error("LLM returned no choices");
  }

  return {
    content: choice.message.content ?? null,
    toolCalls: choice.message.tool_calls ?? [],
  };
}
