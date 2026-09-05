/**
 * storyteller-mcp <stories.jsonl>
 *
 * Serves the Librarian over stdio for an MCP client. The file is the one a
 * fileStore audience writes; nothing here ever writes to it.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileStore } from "@lovelaces-io/storyteller/store/file";
import { createLibrarian } from "./server.js";

const path = process.argv[2];
if (!path || path === "--help" || path === "-h") {
  process.stderr.write(
    [
      "Usage: storyteller-mcp <stories.jsonl>",
      "",
      "Serves the stories in a Storyteller file store to an MCP client over stdio. Read-only.",
      "",
      "  .mcp.json",
      '  { "mcpServers": { "storyteller": { "command": "npx", "args": ["-y", "@lovelaces-io/storyteller-mcp", "./stories.jsonl"] } } }',
      "",
    ].join("\n")
  );
  process.exit(path ? 0 : 1);
}

const server = createLibrarian({ store: fileStore(path) });
await server.connect(new StdioServerTransport());
