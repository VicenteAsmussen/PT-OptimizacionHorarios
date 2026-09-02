import { app } from "./app.js";
import { env } from "./config/env.js";

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT} in ${env.NODE_ENV} mode`);
});

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("Shutting down server...");
  server.close(() => {
    process.exit(0);
  });
});
