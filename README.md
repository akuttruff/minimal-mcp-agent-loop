# minimal-mcp-agent-loop

A secure agent loop in TypeScript that bridges local LLMs to [MCP (Model Context Protocol)](https://modelcontextprotocol.io) servers, with [OWASP security for LLM applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) as a first priority. Works with any OpenAI-compatible LLM server — [oMLX](https://omlx.ai/), [LM Studio](https://lmstudio.ai), Ollama, etc.

## What it does

When a local LLM has tools available, it outputs tool call JSON — but nothing actually executes those calls. This agent loop closes that gap:

1. Sends your question to the LLM with available MCP tools
2. Parses tool calls from the response
3. Validates against an allowlist, rate limits, and sanitizes arguments
4. Executes the tool call via the MCP server
5. Wraps the result in security delimiters and feeds it back
6. Repeats until the model produces a final answer (or hits the iteration cap)

## Dependencies

One runtime dependency: `@modelcontextprotocol/sdk`. Native `fetch` handles LLM API calls. No API keys required.

## Setup

```bash
npm install
npm run build
```

### Configure

Create an `agent-config.json`:

```json
{
  "model": "llama3.3:70b",
  "toolAllowlist": ["web_search", "fetch_page", "research"],
  "mcpServers": [
    {
      "name": "deep-research",
      "command": "node",
      "args": ["/absolute/path/to/minimal-mcp-deep-research/dist/index.js"]
    }
  ]
}
```

The system determines settings using the following override hierarchy (highest to lowest):

1. Environment Variables (overrides all)

2. agent-config.json

3. Built-in Defaults (used only if no other value is found)

| Env var | Default | Description |
|---------|---------|-------------|
| `LLM_BASE_URL` | `http://localhost:8000` | LLM server endpoint (oMLX default) |
| `MODEL` | `llama3.3:70b` | Model name |
| `MAX_ITERATIONS` | `10` | Max agent loop iterations per query |
| `RATE_LIMIT_MAX_CALLS` | `30` | Max tool calls per window |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate limit window |
| `AUDIT_LOG_PATH` | `audit.jsonl` | Path to audit log |

### Run

```bash
# Interactive REPL
node dist/index.js

# Single query
node dist/index.js --query "What is MCP?"

# With a different LLM server (e.g., LM Studio)
LLM_BASE_URL=http://localhost:1234 node dist/index.js
```

### REPL commands

- `/tools` — list discovered tools
- `/clear` — clear conversation history
- `/quit` — exit

## Security considerations ([OWASP Top 10 for LLM Applications 2025](https://owasp.org/www-project-top-10-for-large-language-model-applications/))

This agent loop was built with the [OWASP Top 10 for LLM Applications (2025 edition)](https://owasp.org/www-project-top-10-for-large-language-model-applications/) as a reference. Here's how each relevant risk is addressed:

### [LLM01 — Prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) (HIGH)

Web content fetched by MCP tools can contain hidden instructions designed to manipulate the model. Since local models have weaker prompt injection resistance than commercial APIs, this is the highest-priority risk.

**Mitigations:**
- All tool results are wrapped in structured delimiters that label content as data, not instructions.
- The system prompt explicitly instructs the model to treat tool output as untrusted data.
- Tool arguments are sanitized: control characters stripped, string lengths enforced, nesting depth limited.
- Tool results are scanned for common injection patterns (e.g., "ignore previous instructions"). Suspicious results are flagged with a warning but not blocked (to avoid false positives).

### [LLM06 — Excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) (HIGH)

An agent with unrestricted tool access can be manipulated into taking unintended actions.

**Mitigations:**
- Tool allowlist: only explicitly permitted tools can be called. Tools not in the allowlist are blocked and logged.
- Every tool call is audited to an append-only JSONL log with timestamps and OWASP risk labels.
- All connected MCP tools are read-only (no write, delete, or modify operations).

### [LLM10 — Unbounded consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/) (HIGH)

Without limits, the agent could loop indefinitely or flood MCP servers with requests.

**Mitigations:**
- Hard cap of 10 iterations per query (configurable).
- Sliding-window rate limiter: 30 tool calls per 60 seconds (configurable).
- LLM API calls enforce a timeout via `AbortSignal.timeout()`.
- MCP servers enforce their own per-request timeouts and content length limits.

### [LLM02 — Sensitive information disclosure](https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/) (MEDIUM)

Configuration files or logs could leak secrets.

**Mitigations:**
- Secrets are loaded from environment variables only, never from config files.
- The audit log records tool names, argument keys, and result lengths — not full result content.
- The system prompt contains no secrets or privileged information.

### [LLM05 — Improper output handling](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/) (MEDIUM)

Raw tool output fed back to the model could contain executable content.

**Mitigations:**
- Tool results are wrapped in structured XML delimiters before being returned to the model.
- MCP servers strip HTML and return plain text (enforced by the connected servers).

### [LLM03 — Supply chain](https://genai.owasp.org/llmrisk/llm032025-supply-chain/) (LOW)

Third-party dependencies are a vector for malicious code.

**Mitigations:**
- Single runtime dependency (`@modelcontextprotocol/sdk`), maintained by Anthropic.
- Native `fetch` and `readline` from Node.js stdlib for LLM calls and CLI.

### [LLM07 — System prompt leakage](https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/) (LOW)

System prompts containing secrets can be extracted by adversarial queries.

**Mitigations:**
- The system prompt contains only tool usage instructions and a data-handling directive.
- No secrets, API keys, or sensitive configuration in the prompt.

### Audit log

Every tool call, block, rate limit event, and error is logged to `audit.jsonl` as append-only JSONL. Each entry includes an ISO 8601 timestamp, event type, and OWASP risk label where applicable.

### Important caveat

These mitigations reduce risk but do not eliminate it. Local models have not been adversarially trained against prompt injection to the same degree as commercial APIs. The tool allowlist and rate limiter are your most reliable safeguards — always review the audit log after sessions involving unfamiliar content.

## License

MIT
