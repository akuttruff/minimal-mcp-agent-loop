import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { Agent, type LLMCallFn } from "./agent.js";
import { RateLimiter } from "./rate-limiter.js";
import { AuditLogger } from "./audit.js";
import { MCPClientManager } from "./mcp-client.js";
import type { AgentConfig } from "./config.js";
import type { LLMResponse } from "./llm-client.js";

const TEST_AUDIT_PATH = "test-agent-audit.jsonl";

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    model: "test-model",
    llmBaseUrl: "http://localhost:8000",
    llmTimeoutMs: 10_000,
    maxIterations: 10,
    toolAllowlist: [],
    mcpServers: [],
    rateLimitMaxCalls: 30,
    rateLimitWindowSeconds: 60,
    auditLogPath: TEST_AUDIT_PATH,
    ...overrides,
  };
}

function makeMockMCP(): MCPClientManager {
  const mcp = new MCPClientManager([], []);

  (mcp as unknown as Record<string, unknown>).getToolsForLLM = () => [{
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  }];
  (mcp as unknown as Record<string, unknown>).isAllowed = (name: string) => name === "web_search";
  (mcp as unknown as Record<string, unknown>).serverNameFor = () => "test-server";
  (mcp as unknown as Record<string, unknown>).callTool = async () => "Search results: example content";

  return mcp;
}

function mockLLM(responses: LLMResponse[]): LLMCallFn {
  let callIndex = 0;
  return async () => {
    const response = responses[callIndex];
    callIndex++;
    if (!response) {
      return { content: "(no more mock responses)", toolCalls: [] };
    }
    return response;
  };
}

describe("Agent", () => {
  afterEach(() => {
    try { unlinkSync(TEST_AUDIT_PATH); } catch { /* noop */ }
  });

  it("returns the final answer when model produces no tool calls", async () => {
    const agent = new Agent(
      makeConfig(),
      makeMockMCP(),
      new RateLimiter(30, 60),
      new AuditLogger(TEST_AUDIT_PATH),
      mockLLM([{ content: "The answer is 42.", toolCalls: [] }]),
    );

    const result = await agent.run("What is the meaning of life?");
    assert.equal(result.finalAnswer, "The answer is 42.");
    assert.equal(result.iterations, 1);
    assert.equal(result.toolCallsMade.length, 0);
  });

  it("executes a tool call and returns the final answer", async () => {
    const agent = new Agent(
      makeConfig(),
      makeMockMCP(),
      new RateLimiter(30, 60),
      new AuditLogger(TEST_AUDIT_PATH),
      mockLLM([
        {
          content: null,
          toolCalls: [{
            id: "call_1",
            type: "function",
            function: { name: "web_search", arguments: '{"query":"test"}' },
          }],
        },
        { content: "Based on the search, here is the answer.", toolCalls: [] },
      ]),
    );

    const result = await agent.run("Search for test");
    assert.equal(result.finalAnswer, "Based on the search, here is the answer.");
    assert.equal(result.iterations, 2);
    assert.equal(result.toolCallsMade.length, 1);
    assert.equal(result.toolCallsMade[0]?.name, "web_search");
  });

  it("stops at the iteration limit", async () => {
    const infiniteToolCalls: LLMResponse = {
      content: null,
      toolCalls: [{
        id: "call_loop",
        type: "function",
        function: { name: "web_search", arguments: '{"query":"loop"}' },
      }],
    };

    const agent = new Agent(
      makeConfig({ maxIterations: 3 }),
      makeMockMCP(),
      new RateLimiter(30, 60),
      new AuditLogger(TEST_AUDIT_PATH),
      mockLLM([infiniteToolCalls, infiniteToolCalls, infiniteToolCalls]),
    );

    const result = await agent.run("Keep searching");
    assert.equal(result.iterations, 3);
    assert.ok(result.finalAnswer.includes("iteration limit"));
    assert.equal(result.toolCallsMade.length, 3);
  });

  it("blocks disallowed tools", async () => {
    const agent = new Agent(
      makeConfig(),
      makeMockMCP(),
      new RateLimiter(30, 60),
      new AuditLogger(TEST_AUDIT_PATH),
      mockLLM([
        {
          content: null,
          toolCalls: [{
            id: "call_blocked",
            type: "function",
            function: { name: "dangerous_tool", arguments: '{}' },
          }],
        },
        { content: "Tool was blocked.", toolCalls: [] },
      ]),
    );

    const result = await agent.run("Try the dangerous tool");
    assert.equal(result.finalAnswer, "Tool was blocked.");
  });

  it("handles malformed tool call arguments", async () => {
    const agent = new Agent(
      makeConfig(),
      makeMockMCP(),
      new RateLimiter(30, 60),
      new AuditLogger(TEST_AUDIT_PATH),
      mockLLM([
        {
          content: null,
          toolCalls: [{
            id: "call_bad",
            type: "function",
            function: { name: "web_search", arguments: "not valid json{{{" },
          }],
        },
        { content: "Handled the error.", toolCalls: [] },
      ]),
    );

    const result = await agent.run("Bad args");
    assert.equal(result.finalAnswer, "Handled the error.");
  });

  it("handles rate limiting", async () => {
    const agent = new Agent(
      makeConfig(),
      makeMockMCP(),
      new RateLimiter(1, 60),
      new AuditLogger(TEST_AUDIT_PATH),
      mockLLM([
        {
          content: null,
          toolCalls: [{
            id: "call_1",
            type: "function",
            function: { name: "web_search", arguments: '{"query":"first"}' },
          }],
        },
        {
          content: null,
          toolCalls: [{
            id: "call_2",
            type: "function",
            function: { name: "web_search", arguments: '{"query":"second"}' },
          }],
        },
        { content: "Done.", toolCalls: [] },
      ]),
    );

    const result = await agent.run("Rate limit me");
    assert.equal(result.finalAnswer, "Done.");
    assert.equal(result.toolCallsMade.length, 2);
  });
});
