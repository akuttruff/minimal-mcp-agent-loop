import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { loadConfig } from "./config.js";
import {
  DEFAULT_MODEL,
  LLM_BASE_URL,
  LLM_TIMEOUT_MS,
  MAX_ITERATIONS,
  RATE_LIMIT_MAX_CALLS,
  RATE_LIMIT_WINDOW_SECONDS,
  AUDIT_LOG_PATH,
} from "./constants.js";

const TEST_CONFIG_PATH = "test-agent-config.json";

describe("loadConfig", () => {
  beforeEach(() => {
    delete process.env["MODEL"];
    delete process.env["LLM_BASE_URL"];
    delete process.env["LLM_TIMEOUT_MS"];
    delete process.env["MAX_ITERATIONS"];
    delete process.env["RATE_LIMIT_MAX_CALLS"];
    delete process.env["RATE_LIMIT_WINDOW_SECONDS"];
    delete process.env["AUDIT_LOG_PATH"];
  });

  afterEach(() => {
    try {
      unlinkSync(TEST_CONFIG_PATH);
    } catch {
      // file may not exist
    }
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig("nonexistent.json");
    assert.equal(config.model, DEFAULT_MODEL);
    assert.equal(config.llmBaseUrl, LLM_BASE_URL);
    assert.equal(config.llmTimeoutMs, LLM_TIMEOUT_MS);
    assert.equal(config.maxIterations, MAX_ITERATIONS);
    assert.deepEqual(config.toolAllowlist, []);
    assert.deepEqual(config.mcpServers, []);
    assert.equal(config.rateLimitMaxCalls, RATE_LIMIT_MAX_CALLS);
    assert.equal(config.rateLimitWindowSeconds, RATE_LIMIT_WINDOW_SECONDS);
    assert.equal(config.auditLogPath, AUDIT_LOG_PATH);
  });

  it("reads values from a config file", () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
      model: "custom-model",
      llmBaseUrl: "http://localhost:1234",
      maxIterations: 5,
      toolAllowlist: ["web_search"],
      mcpServers: [{ name: "test", command: "node", args: ["test.js"] }],
    }));
    const config = loadConfig(TEST_CONFIG_PATH);
    assert.equal(config.model, "custom-model");
    assert.equal(config.llmBaseUrl, "http://localhost:1234");
    assert.equal(config.maxIterations, 5);
    assert.deepEqual(config.toolAllowlist, ["web_search"]);
    assert.equal(config.mcpServers.length, 1);
    assert.equal(config.mcpServers[0]?.name, "test");
  });

  it("env vars override config file values", () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
      model: "file-model",
      llmBaseUrl: "http://localhost:1234",
    }));
    process.env["MODEL"] = "env-model";
    process.env["LLM_BASE_URL"] = "http://localhost:9999";
    const config = loadConfig(TEST_CONFIG_PATH);
    assert.equal(config.model, "env-model");
    assert.equal(config.llmBaseUrl, "http://localhost:9999");
  });

  it("env vars override numeric config values", () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ maxIterations: 5 }));
    process.env["MAX_ITERATIONS"] = "20";
    const config = loadConfig(TEST_CONFIG_PATH);
    assert.equal(config.maxIterations, 20);
  });

  it("ignores invalid numeric env vars", () => {
    process.env["MAX_ITERATIONS"] = "not-a-number";
    const config = loadConfig("nonexistent.json");
    assert.equal(config.maxIterations, MAX_ITERATIONS);
  });

  it("handles malformed JSON config file gracefully", () => {
    writeFileSync(TEST_CONFIG_PATH, "{ invalid json }}}");
    const config = loadConfig(TEST_CONFIG_PATH);
    assert.equal(config.model, DEFAULT_MODEL);
  });
});
