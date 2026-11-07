import { app } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/index.js";

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`AYNI API escuchando en http://127.0.0.1:${config.port}`);
  if (!config.dbConfigured) console.warn("Configura la conexión a MySQL en backend/.env para habilitar los datos.");
});
const shutdown = () => {
  server.close(() => { void pool.end().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
