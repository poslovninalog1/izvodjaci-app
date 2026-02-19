import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { CONFIG } from "./config.js";
import { contractRoutes } from "./routes/contract.routes.js";

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
    trustProxy: true,
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(contractRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  await app.listen({ port: CONFIG.server.port, host: CONFIG.server.host });
  console.log(`Contracts module listening on ${CONFIG.server.host}:${CONFIG.server.port}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
