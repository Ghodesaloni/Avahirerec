require("dotenv").config();
const path = require("path");

// Fix invalid or non-numeric WDS_SOCKET_PORT (such as "ws://localhost:3000") which causes
// webpack-dev-server client to format WebSocket URL as ":NaN/ws"
if (
  process.env.WDS_SOCKET_PORT &&
  (isNaN(Number(process.env.WDS_SOCKET_PORT)) || !/^\d+$/.test(String(process.env.WDS_SOCKET_PORT).trim()))
) {
  delete process.env.WDS_SOCKET_PORT;
}

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      const definePlugin = webpackConfig.plugins.find(
        (plugin) => plugin && plugin.constructor && plugin.constructor.name === "DefinePlugin"
      );
      if (definePlugin && definePlugin.definitions && definePlugin.definitions["process.env"]) {
        const envDefs = definePlugin.definitions["process.env"];
        if (
          envDefs.WDS_SOCKET_PORT &&
          (envDefs.WDS_SOCKET_PORT.includes("ws://") || envDefs.WDS_SOCKET_PORT === '"NaN"')
        ) {
          delete envDefs.WDS_SOCKET_PORT;
        }
      }
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    devServerConfig.allowedHosts = "all";

    if (devServerConfig.client && devServerConfig.client.webSocketURL) {
      if (typeof devServerConfig.client.webSocketURL === "object") {
        const port = devServerConfig.client.webSocketURL.port;
        if (port !== undefined && (isNaN(Number(port)) || !/^\d+$/.test(String(port).trim()))) {
          delete devServerConfig.client.webSocketURL.port;
        }
      }
    }

    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;
    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      const express = require("express");

      devServer.app.use(express.json({ limit: "25mb" }));
      devServer.app.use(express.urlencoded({ extended: true, limit: "25mb" }));
      devServer.app.use((req, res, next) => {
        res.setHeader("X-Server-Provider", "Amazon Web Services (AWS)");
        res.setHeader("X-Server-Environment", "AWS-Development");
        next();
      });
      const { getConnectionStatus } = require("./server/db/postgres");
      devServer.app.get(["/health", "/api/health"], (req, res) => {
        const dbStatus = getConnectionStatus();
        res.status(200).json({
          status: "healthy",
          provider: "Amazon Web Services (AWS)",
          service: "AWS App Runner / EC2",
          region: process.env.AWS_REGION || "us-east-1",
          timestamp: new Date().toISOString(),
          database: dbStatus,
          modules: {
            compute: "AWS EC2 / App Runner",
            database: dbStatus.connected ? "AWS RDS PostgreSQL (Connected)" : "Local JSON Engine (Dual-Layer Fallback)",
            storage: "AWS S3",
            messaging: process.env.SMTP_USER ? `SMTP (${process.env.SMTP_USER})` : "SMTP"
          }
        });
      });
      devServer.app.get("/api/db-status", (req, res) => {
        res.status(200).json(getConnectionStatus());
      });
      devServer.app.use("/api", (req, res, next) => {
        const serverDir = path.resolve(__dirname, "server");
        Object.keys(require.cache).forEach((key) => {
          if (key.startsWith(serverDir)) {
            delete require.cache[key];
          }
        });
        const currentApiRouter = require("./server/routes");
        currentApiRouter(req, res, next);
      });

      if (originalSetupMiddlewares) {
        return originalSetupMiddlewares(middlewares, devServer);
      }
      return middlewares;
    };
    return devServerConfig;
  },
};
