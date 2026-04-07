import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MCPClientManager } from "../mcp-client.js";

describe("MCPClientManager", () => {
  it("constructs without error", () => {
    const manager = new MCPClientManager([], []);
    assert.ok(manager);
  });

  it("starts and stops with no servers configured", async () => {
    const manager = new MCPClientManager([], []);
    await manager.start();
    assert.deepEqual(manager.getTools(), []);
    assert.deepEqual(manager.getToolsForLLM(), []);
    await manager.stop();
  });

  it("reports tool as not allowed when no servers are running", () => {
    const manager = new MCPClientManager([], ["web_search"]);
    assert.equal(manager.isAllowed("web_search"), false);
  });

  it("returns unknown for serverNameFor with no servers", () => {
    const manager = new MCPClientManager([], []);
    assert.equal(manager.serverNameFor("nonexistent"), "unknown");
  });

  it("rejects callTool for unknown tools", async () => {
    const manager = new MCPClientManager([], []);
    await assert.rejects(
      manager.callTool("nonexistent", {}),
      /Tool not found or not allowed/,
    );
  });
});
