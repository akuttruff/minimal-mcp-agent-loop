import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "./config.js";
import { APP_NAME, APP_VERSION } from "./constants.js";

export interface DiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

interface ServerConnection {
  client: Client;
  transport: StdioClientTransport;
  serverName: string;
}

export class MCPClientManager {
  private connections: ServerConnection[] = [];
  private toolMap = new Map<string, ServerConnection>();
  private allowlist: ReadonlySet<string>;

  constructor(
    private readonly serverConfigs: readonly MCPServerConfig[],
    toolAllowlist: readonly string[],
  ) {
    this.allowlist = new Set(toolAllowlist);
  }

  async start(): Promise<void> {
    for (const config of this.serverConfigs) {
      const transportParams: {
        command: string;
        args: string[];
        stderr: "pipe";
        env?: Record<string, string>;
      } = {
        command: config.command,
        args: [...config.args],
        stderr: "pipe",
      };
      if (config.env) {
        transportParams.env = { ...process.env, ...config.env } as Record<string, string>;
      }
      const transport = new StdioClientTransport(transportParams);

      const client = new Client(
        { name: APP_NAME, version: APP_VERSION },
        { capabilities: {} },
      );

      await client.connect(transport);

      const connection: ServerConnection = { client, transport, serverName: config.name };
      this.connections.push(connection);

      const { tools } = await client.listTools();
      for (const tool of tools) {
        if (this.allowlist.size === 0 || this.allowlist.has(tool.name)) {
          this.toolMap.set(tool.name, connection);
        }
      }
    }
  }

  async stop(): Promise<void> {
    for (const { transport } of this.connections) {
      await transport.close().catch(() => {});
    }
    this.connections = [];
    this.toolMap.clear();
  }

  getTools(): DiscoveredTool[] {
    const tools: DiscoveredTool[] = [];
    const seen = new Set<string>();

    for (const connection of this.connections) {
      // Re-read from the stored tool map
      for (const [name, conn] of this.toolMap) {
        if (conn === connection && !seen.has(name)) {
          seen.add(name);
          tools.push({
            name,
            description: "",
            inputSchema: {},
            serverName: conn.serverName,
          });
        }
      }
    }

    return tools;
  }

  getToolsForLLM(): { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[] {
    // We need the full tool info, so re-list from cached data
    // For now, we'll store it during start()
    return this._cachedToolDefs;
  }

  private _cachedToolDefs: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[] = [];

  async discoverAndCacheTools(): Promise<void> {
    this._cachedToolDefs = [];

    for (const connection of this.connections) {
      const { tools } = await connection.client.listTools();
      for (const tool of tools) {
        if (this.allowlist.size === 0 || this.allowlist.has(tool.name)) {
          this._cachedToolDefs.push({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description ?? "",
              parameters: tool.inputSchema as Record<string, unknown>,
            },
          });
        }
      }
    }
  }

  isAllowed(toolName: string): boolean {
    return this.toolMap.has(toolName);
  }

  serverNameFor(toolName: string): string {
    return this.toolMap.get(toolName)?.serverName ?? "unknown";
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const connection = this.toolMap.get(name);
    if (!connection) {
      throw new Error(`Tool not found or not allowed: ${name}`);
    }

    const result = await connection.client.callTool({ name, arguments: args });

    // Extract text content from the MCP result
    const parts: string[] = [];
    for (const item of result.content as { type: string; text?: string }[]) {
      if (item.type === "text" && item.text) {
        parts.push(item.text);
      }
    }

    return parts.join("\n");
  }
}
