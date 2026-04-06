import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";
import { loadConfig } from "./config.js";
import { MCPClientManager } from "./mcp-client.js";
import { RateLimiter } from "./rate-limiter.js";
import { AuditLogger } from "./audit.js";
import { Agent } from "./agent.js";
import type { ChatMessage } from "./llm-client.js";

// --- Parse CLI args ---

function parseArgs(): { query: string | undefined; configPath: string } {
  const args = argv.slice(2);
  let query: string | undefined;
  let configPath = "agent-config.json";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--query" || arg === "-q") && args[i + 1]) {
      query = args[++i];
    } else if ((arg === "--config" || arg === "-c") && args[i + 1]) {
      configPath = args[++i] ?? configPath;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: minimal-mcp-agent-loop [options]

Options:
  -q, --query <text>   Run a single query and exit
  -c, --config <path>  Path to config file (default: agent-config.json)
  -h, --help           Show this help message

Interactive commands:
  /tools               List discovered tools
  /clear               Clear conversation history
  /quit                Exit the REPL`);
      exit(0);
    }
  }

  return { query, configPath };
}

// --- Main ---

async function main(): Promise<void> {
  const { query, configPath } = parseArgs();
  const config = loadConfig(configPath);

  if (config.mcpServers.length === 0) {
    console.error("No MCP servers configured. Create an agent-config.json with mcpServers.");
    console.error('Example: { "mcpServers": [{ "name": "deep-research", "command": "node", "args": ["/path/to/dist/index.js"] }] }');
    exit(1);
  }

  console.error(`Connecting to ${config.mcpServers.length} MCP server(s)...`);

  const mcp = new MCPClientManager(config.mcpServers, config.toolAllowlist);

  try {
    await mcp.start();
    await mcp.discoverAndCacheTools();
  } catch (error) {
    console.error("Failed to connect to MCP servers:", error instanceof Error ? error.message : error);
    exit(1);
  }

  const tools = mcp.getToolsForLLM();
  console.error(`Discovered ${tools.length} tool(s): ${tools.map((t) => t.function.name).join(", ")}`);

  const rateLimiter = new RateLimiter(config.rateLimitMaxCalls, config.rateLimitWindowSeconds);
  const audit = new AuditLogger(config.auditLogPath);
  const agent = new Agent(config, mcp, rateLimiter, audit);

  // Handle shutdown
  const shutdown = async () => {
    console.error("\nShutting down...");
    await mcp.stop();
    exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  if (query) {
    // Single query mode
    const result = await agent.run(query);
    console.log(result.finalAnswer);
    console.error(`\n[${result.iterations} iteration(s), ${result.toolCallsMade.length} tool call(s)]`);
    await mcp.stop();
    return;
  }

  // Interactive REPL
  const rl = createInterface({ input: stdin, output: stdout });
  const history: ChatMessage[] = [];

  console.error("Ready. Type your question or /help for commands.\n");

  try {
    while (true) {
      const input = await rl.question("you> ");
      const trimmed = input.trim();

      if (!trimmed) continue;

      if (trimmed === "/quit" || trimmed === "/exit") {
        break;
      }

      if (trimmed === "/clear") {
        history.length = 0;
        console.error("Conversation cleared.\n");
        continue;
      }

      if (trimmed === "/tools") {
        for (const tool of mcp.getToolsForLLM()) {
          console.log(`  ${tool.function.name} — ${tool.function.description}`);
        }
        console.log();
        continue;
      }

      if (trimmed === "/help") {
        console.log("Commands: /tools, /clear, /quit, /help\n");
        continue;
      }

      try {
        const result = await agent.run(trimmed, history);
        console.log(`\nassistant> ${result.finalAnswer}\n`);
        console.error(`[${result.iterations} iteration(s), ${result.toolCallsMade.length} tool call(s)]`);

        // Append to history for multi-turn
        history.push({ role: "user", content: trimmed });
        history.push({ role: "assistant", content: result.finalAnswer });
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
      }
    }
  } finally {
    rl.close();
    await mcp.stop();
  }
}

main().catch((error) => {
  console.error("Fatal:", error);
  exit(1);
});
