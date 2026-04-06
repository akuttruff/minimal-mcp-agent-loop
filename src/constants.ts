// Server identity
export const APP_NAME = "minimal-mcp-agent-loop";
export const APP_VERSION = "1.0.0";
export const USER_AGENT = "MinimalMCPAgent/1.0";

// LLM backend
export const LLM_BASE_URL = "http://localhost:8000";
export const LLM_TIMEOUT_MS = 120_000;
export const DEFAULT_MODEL = "llama3.3:70b";

// Agent loop
export const MAX_ITERATIONS = 10;

// Rate limiting
export const RATE_LIMIT_MAX_CALLS = 30;
export const RATE_LIMIT_WINDOW_SECONDS = 60;

// Sanitization
export const MAX_INPUT_LENGTH = 10_000;
export const MAX_PARAM_DEPTH = 4;
export const MAX_STRING_PARAM_LENGTH = 5_000;

// Audit
export const AUDIT_LOG_PATH = "audit.jsonl";

// OWASP risk labels (for audit log entries)
export const OWASP_RISKS = {
  LLM01: "Prompt Injection",
  LLM02: "Sensitive Information Disclosure",
  LLM03: "Supply Chain",
  LLM05: "Improper Output Handling",
  LLM06: "Excessive Agency",
  LLM07: "System Prompt Leakage",
  LLM10: "Unbounded Consumption",
} as const;

// Private IP ranges for SSRF protection
export const PRIVATE_IP_PREFIXES = [
  "10.",
  "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.",
  "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.",
  "192.168.",
  "127.",
  "0.",
  "169.254.",
] as const;

export const PRIVATE_IPV6_PREFIXES = [
  "::1",
  "fc00:",
  "fd00:",
  "fe80:",
] as const;
