import express from "express";
import pino from "pino";
import { retailTransactionsRouter } from "./routes/retail-transactions.js";
import { batchRouter } from "./routes/batch.js";

const logger = pino({ transport: { target: "pino-pretty" } });
const app = express();
const PORT = Number(process.env.ERP_MOCK_PORT ?? 4010);

app.use(express.json({ limit: "10mb" }));

// Endpoint principal OData-like para transacciones POS
app.use("/data", retailTransactionsRouter);
app.use("/data", batchRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", provider: "mock" });
});

app.listen(PORT, () => {
  logger.info(`ERP Mock (OData) escuchando en http://localhost:${PORT}`);
});
