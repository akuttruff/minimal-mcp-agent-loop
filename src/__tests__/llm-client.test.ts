import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRawToolCalls } from "../llm-client.js";

const KNOWN_TOOLS = new Set(["web_search", "fetch_page", "research"]);

describe("parseRawToolCalls", () => {
  it("parses llama-3.3 style tool call with name and parameters", () => {
    const text = '{"type": "function", "name": "web_search", "parameters": {"query": "Portland Oregon weather"}}';
    const calls = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.function.name, "web_search");
    assert.deepEqual(JSON.parse(calls[0]?.function.arguments ?? ""), { query: "Portland Oregon weather" });
  });

  it("parses tool call with name and arguments", () => {
    const text = '{"name": "fetch_page", "arguments": {"url": "https://example.com"}}';
    const calls = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.function.name, "fetch_page");
  });

  it("parses tool call with function field instead of name", () => {
    const text = '{"function": "web_search", "parameters": {"query": "test"}}';
    const calls = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.function.name, "web_search");
  });

  it("ignores JSON that is not a tool call", () => {
    const text = '{"message": "hello world"}';
    const calls = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.equal(calls.length, 0);
  });

  it("ignores tool names not in the known set", () => {
    const text = '{"name": "unknown_tool", "parameters": {"foo": "bar"}}';
    const calls = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.equal(calls.length, 0);
  });

  it("handles text with surrounding prose", () => {
    const text = 'I will search for that. {"type": "function", "name": "web_search", "parameters": {"query": "weather"}} Let me find that for you.';
    const calls = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.function.name, "web_search");
  });

  it("returns empty array for plain text with no JSON", () => {
    const calls = parseRawToolCalls("Here is my answer about the weather.", KNOWN_TOOLS);
    assert.equal(calls.length, 0);
  });

  it("returns empty array for empty string", () => {
    const calls = parseRawToolCalls("", KNOWN_TOOLS);
    assert.equal(calls.length, 0);
  });

  it("returns empty array when known tools set is empty", () => {
    const text = '{"name": "web_search", "parameters": {"query": "test"}}';
    const calls = parseRawToolCalls(text, new Set());
    assert.equal(calls.length, 0);
  });

  it("assigns unique IDs to each parsed call", () => {
    const text = '{"name": "web_search", "parameters": {"query": "a"}}';
    const calls1 = parseRawToolCalls(text, KNOWN_TOOLS);
    const calls2 = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.notEqual(calls1[0]?.id, calls2[0]?.id);
  });

  it("handles malformed JSON gracefully", () => {
    const text = '{"name": "web_search", "parameters": {broken}}';
    const calls = parseRawToolCalls(text, KNOWN_TOOLS);
    assert.equal(calls.length, 0);
  });
});
