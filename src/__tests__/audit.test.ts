import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { AuditLogger } from "../audit.js";

const TEST_LOG_PATH = "test-audit.jsonl";

function readLog(): string[] {
  return readFileSync(TEST_LOG_PATH, "utf-8").trim().split("\n");
}

function parseLog(): Record<string, unknown>[] {
  return readLog().map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("AuditLogger", () => {
  afterEach(() => {
    try {
      unlinkSync(TEST_LOG_PATH);
    } catch {
      // file may not exist
    }
  });

  it("writes valid JSONL for tool_call events", () => {
    const logger = new AuditLogger(TEST_LOG_PATH);
    logger.logToolCall("web_search", { query: "hello" }, "deep-research", 1);
    const entries = parseLog();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.["event"], "tool_call");
    assert.equal(entries[0]?.["toolName"], "web_search");
    assert.equal(entries[0]?.["serverName"], "deep-research");
    assert.equal(entries[0]?.["iteration"], 1);
  });

  it("writes valid JSONL for tool_result events", () => {
    const logger = new AuditLogger(TEST_LOG_PATH);
    logger.logToolResult("fetch_page", 150, 5000);
    const entries = parseLog();
    assert.equal(entries[0]?.["event"], "tool_result");
    assert.equal(entries[0]?.["durationMs"], 150);
    assert.equal(entries[0]?.["resultLength"], 5000);
  });

  it("writes valid JSONL for blocked events", () => {
    const logger = new AuditLogger(TEST_LOG_PATH);
    logger.logBlocked("dangerous_tool", "not in allowlist", "LLM06");
    const entries = parseLog();
    assert.equal(entries[0]?.["event"], "blocked");
    assert.equal(entries[0]?.["reason"], "not in allowlist");
    assert.equal(entries[0]?.["owaspRisk"], "LLM06");
  });

  it("writes valid JSONL for rate_limit events", () => {
    const logger = new AuditLogger(TEST_LOG_PATH);
    logger.logRateLimit("web_search");
    const entries = parseLog();
    assert.equal(entries[0]?.["event"], "rate_limit");
    assert.equal(entries[0]?.["owaspRisk"], "LLM10");
  });

  it("writes valid JSONL for error events", () => {
    const logger = new AuditLogger(TEST_LOG_PATH);
    logger.logError("connection failed", { toolName: "fetch_page" });
    const entries = parseLog();
    assert.equal(entries[0]?.["event"], "error");
    assert.equal(entries[0]?.["error"], "connection failed");
    assert.equal(entries[0]?.["toolName"], "fetch_page");
  });

  it("includes ISO 8601 timestamps", () => {
    const logger = new AuditLogger(TEST_LOG_PATH);
    logger.logToolCall("web_search", {}, "test", 0);
    const entries = parseLog();
    const timestamp = entries[0]?.["timestamp"] as string;
    assert.ok(timestamp);
    assert.doesNotThrow(() => new Date(timestamp));
    assert.ok(timestamp.includes("T"));
  });

  it("appends multiple entries without overwriting", () => {
    const logger = new AuditLogger(TEST_LOG_PATH);
    logger.logToolCall("tool1", {}, "server1", 1);
    logger.logToolCall("tool2", {}, "server2", 2);
    logger.logError("oops");
    const entries = parseLog();
    assert.equal(entries.length, 3);
    assert.equal(entries[0]?.["toolName"], "tool1");
    assert.equal(entries[1]?.["toolName"], "tool2");
    assert.equal(entries[2]?.["event"], "error");
  });

  it("appends across logger instances (append-only)", () => {
    const logger1 = new AuditLogger(TEST_LOG_PATH);
    logger1.logToolCall("first", {}, "s1", 1);
    const logger2 = new AuditLogger(TEST_LOG_PATH);
    logger2.logToolCall("second", {}, "s2", 2);
    const entries = parseLog();
    assert.equal(entries.length, 2);
  });
});
