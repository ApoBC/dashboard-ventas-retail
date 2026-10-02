import { Router } from "express";
import { addTransactions, getCount } from "../data/store.js";
import type { RetailTransaction } from "@retail/shared";

export const batchRouter = Router();

/** POST /data/RetailTransactions/batch — inyecta transacciones al mock */
batchRouter.post("/RetailTransactions/batch", (req, res) => {
  const body = req.body as { transactions: RetailTransaction[] };
  if (!Array.isArray(body?.transactions)) {
    res.status(400).json({ error: "Se esperaba { transactions: [...] }" });
    return;
  }

  const added = addTransactions(body.transactions);
  res.json({ added, total: getCount() });
});
