import { readFileSync } from "node:fs";
import {
  AUDIT_LOG_PATH,
  DEFAULT_MODEL,
  LLM_BASE_URL,
  LLM_TIMEOUT_MS,
  MAX_ITERATIONS,
  RATE_LIMIT_MAX_CALLS,
  RATE_LIMIT_WINDOW_SECONDS,
} from "./constants.js";

export interface MCPServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface AgentConfig {
  readonly model: string;
  readonly llmBaseUrl: string;
  readonly llmTimeoutMs: number;
  readonly maxIterations: number;
  readonly toolAllowlist: readonly string[];
  readonly mcpServers: readonly MCPServerConfig[];
  readonly rateLimitMaxCalls: number;
  readonly rateLimitWindowSeconds: number;
  readonly auditLogPath: string;
}

interface ConfigFile {
  model?: string;
  llmBaseUrl?: string;
  llmTimeoutMs?: number;
  maxIterations?: number;
  toolAllowlist?: string[];
  mcpServers?: MCPServerConfig[];
  rateLimitMaxCalls?: number;
  rateLimitWindowSeconds?: number;
  auditLogPath?: string;
}

function readConfigFile(path: string): ConfigFile {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as ConfigFile;
  } catch {
    return {};
  }
}

function envInt(name: string): number | undefined {
  const val = process.env[name];
  if (val === undefined) return undefined;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function loadConfig(configPath = "agent-config.json"): AgentConfig {
  const file = readConfigFile(configPath);

  return {
    model: process.env["MODEL"] ?? file.model ?? DEFAULT_MODEL,
    llmBaseUrl: process.env["LLM_BASE_URL"] ?? file.llmBaseUrl ?? LLM_BASE_URL,
    llmTimeoutMs: envInt("LLM_TIMEOUT_MS") ?? file.llmTimeoutMs ?? LLM_TIMEOUT_MS,
    maxIterations: envInt("MAX_ITERATIONS") ?? file.maxIterations ?? MAX_ITERATIONS,
    toolAllowlist: file.toolAllowlist ?? [],
    mcpServers: file.mcpServers ?? [],
    rateLimitMaxCalls: envInt("RATE_LIMIT_MAX_CALLS") ?? file.rateLimitMaxCalls ?? RATE_LIMIT_MAX_CALLS,
    rateLimitWindowSeconds: envInt("RATE_LIMIT_WINDOW_SECONDS") ?? file.rateLimitWindowSeconds ?? RATE_LIMIT_WINDOW_SECONDS,
    auditLogPath: process.env["AUDIT_LOG_PATH"] ?? file.auditLogPath ?? AUDIT_LOG_PATH,
  };
}
