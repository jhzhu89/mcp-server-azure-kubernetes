import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "@jhzhu89/azure-client-pool";

const httpLogger = logger.child({ component: "http-server" });

export function startStreamableHTTPServer(getServer: () => Server) {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const server = getServer();
      const transport: StreamableHTTPServerTransport =
        new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
      res.on("close", () => {
        httpLogger.debug("HTTP request closed");
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      httpLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          url: req.url,
          method: req.method,
        },
        "Error handling MCP request",
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    httpLogger.debug(
      { method: "GET", url: req.url },
      "Received GET MCP request (method not allowed)",
    );
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      }),
    );
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    httpLogger.debug(
      { method: "DELETE", url: req.url },
      "Received DELETE MCP request (method not allowed)",
    );
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      }),
    );
  });

  const port = process.env.PORT || 3000;
  app.listen(port);
  httpLogger.info({ port }, "MCP Streamable HTTP Server listening");
}
