import { Router } from "express";
import { getTransactions } from "../data/store.js";

export const retailTransactionsRouter = Router();

/**
 * GET /data/RetailTransactions
 *
 * Simula un endpoint OData v4 con soporte para:
 *   $filter=ModifiedDateTime gt '2026-09-01T00:00:00Z' and TransactionId gt 'TX-1234'
 *   $orderby=ModifiedDateTime,TransactionId
 *   $top=500
 *   $expand=Lines
 *
 * La ingesta usa cursor compuesto (modified_at, transaction_id) en lugar
 * de un simple gt sobre un solo campo, por las razones del hallazgo 1.
 */
retailTransactionsRouter.get("/RetailTransactions", (req, res) => {
  const filter = (req.query.$filter as string) ?? "";
  const top = Math.min(Number(req.query.$top ?? 500), 1000);
  const expand = (req.query.$expand as string) ?? "";

  // Parsear cursor compuesto del $filter
  let afterModified: Date | null = null;
  let afterId = "";

  const modifiedMatch = filter.match(
    /ModifiedDateTime\s+gt\s+'([^']+)'/,
  );
  if (modifiedMatch) {
    afterModified = new Date(modifiedMatch[1]);
  }

  const idMatch = filter.match(/TransactionId\s+gt\s+'([^']+)'/);
  if (idMatch) {
    afterId = idMatch[1];
  }

  const includeLines = expand.includes("Lines");

  const result = getTransactions({
    afterModified,
    afterId,
    top,
    includeLines,
  });

  // Formato OData-like
  res.json({
    "@odata.context":
      "$metadata#RetailTransactions",
    "@odata.count": result.totalCount,
    value: result.items,
  });
});
