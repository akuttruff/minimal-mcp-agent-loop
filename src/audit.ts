import { appendFileSync } from "node:fs";

export interface AuditEntry {
  timestamp: string;
  event: string;
  owaspRisk?: string;
  [key: string]: unknown;
}

export class AuditLogger {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  private write(entry: AuditEntry): void {
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
  }

  logToolCall(toolName: string, args: Record<string, unknown>, serverName: string, iteration: number): void {
    this.write({
      timestamp: new Date().toISOString(),
      event: "tool_call",
      toolName,
      args,
      serverName,
      iteration,
    });
  }

  logToolResult(toolName: string, durationMs: number, resultLength: number): void {
    this.write({
      timestamp: new Date().toISOString(),
      event: "tool_result",
      toolName,
      durationMs,
      resultLength,
    });
  }

  logBlocked(toolName: string, reason: string, owaspRisk: string): void {
    this.write({
      timestamp: new Date().toISOString(),
      event: "blocked",
      toolName,
      reason,
      owaspRisk,
    });
  }

  logRateLimit(toolName: string): void {
    this.write({
      timestamp: new Date().toISOString(),
      event: "rate_limit",
      toolName,
      owaspRisk: "LLM10",
    });
  }

  logError(error: string, context: Record<string, unknown> = {}): void {
    this.write({
      timestamp: new Date().toISOString(),
      event: "error",
      error,
      ...context,
    });
  }
}
