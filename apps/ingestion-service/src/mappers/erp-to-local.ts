import type { RetailTransaction } from "@retail/shared";

/**
 * Mapeo de la forma OData del ERP (RetailTransaction) a la forma
 * local de la BD. Los microservicios solo conocen los modelos propios;
 * este mapeo vive aquí y solo aquí.
 */

export type LocalTransaction = {
  transactionId: string;
  storeId: string;
  terminalId: string;
  cashierId: string;
  transDate: Date;
  totalNeto: number;
  paymentMethod: string;
  isVoid: boolean;
  modifiedAt: Date;
};

export type LocalTransactionLine = {
  transactionId: string;
  transDate: Date;
  lineNum: number;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export function mapTransaction(raw: RetailTransaction): LocalTransaction {
  return {
    transactionId: raw.TransactionId,
    storeId: raw.StoreId,
    terminalId: raw.TerminalId,
    cashierId: raw.CashierId,
    transDate: new Date(raw.TransDate),
    totalNeto: raw.TotalNeto,
    paymentMethod: raw.PaymentMethod,
    isVoid: raw.IsVoid,
    modifiedAt: new Date(raw.ModifiedDateTime),
  };
}

export function mapLines(raw: RetailTransaction): LocalTransactionLine[] {
  return raw.Lines.map((line) => ({
    transactionId: raw.TransactionId,
    transDate: new Date(raw.TransDate),
    lineNum: line.LineNum,
    sku: line.Sku,
    productName: line.ProductName,
    quantity: line.Quantity,
    unitPrice: line.UnitPrice,
    lineTotal: line.LineTotal,
  }));
}
