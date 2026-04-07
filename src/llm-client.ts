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

// --- Raw JSON tool call parsing (for models like llama-3.3 that output tool calls as text) ---

interface RawToolCallJSON {
  type?: string;
  name?: string;
  function?: string;
  parameters?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
}

let rawCallCounter = 0;

/**
 * Attempt to extract tool calls from raw text content.
 * Models like llama-3.3-instruct output tool calls as plain JSON text
 * instead of structured tool_calls, e.g.:
 *   {"type": "function", "name": "web_search", "parameters": {"query": "..."}}
 */
export function parseRawToolCalls(text: string, knownTools: Set<string>): ToolCall[] {
  const calls: ToolCall[] = [];

  // Match JSON objects in the text — may be one or multiple
  const jsonPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match: RegExpExecArray | null;

  while ((match = jsonPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[0]) as RawToolCallJSON;

      // Detect tool call patterns:
      // {"type": "function", "name": "web_search", "parameters": {...}}
      // {"name": "web_search", "arguments": {...}}
      // {"function": "web_search", "parameters": {...}}
      const toolName = parsed.name ?? parsed.function;
      const toolArgs = parsed.parameters ?? parsed.arguments;

      if (typeof toolName === "string" && knownTools.has(toolName) && typeof toolArgs === "object" && toolArgs !== null) {
        calls.push({
          id: `raw_call_${++rawCallCounter}`,
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify(toolArgs),
          },
        });
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return calls;
}

export async function callLLM(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  tools: LLMToolDef[],
  timeoutMs: number,
  knownToolNames?: Set<string>,
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

  const structuredCalls = choice.message.tool_calls ?? [];
  const content = choice.message.content ?? null;

  // If the model returned structured tool_calls, use those
  if (structuredCalls.length > 0) {
    return { content, toolCalls: structuredCalls };
  }

  // Fallback: try to parse raw JSON tool calls from text content
  // (for models like llama-3.3-instruct that output tool calls as text)
  if (content && knownToolNames && knownToolNames.size > 0) {
    const rawCalls = parseRawToolCalls(content, knownToolNames);
    if (rawCalls.length > 0) {
      return { content: null, toolCalls: rawCalls };
    }
  }

  return { content, toolCalls: [] };
}
