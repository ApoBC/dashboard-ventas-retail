/** Contrato del adaptador ERP. Los microservicios solo conocen estos tipos
 *  propios. El mapeo a ReleasedProductsV2 (D365) o Item (ERPNext) vive
 *  solo dentro de cada adaptador. */

export type Product = {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  uom: string;
};

export type StockLevel = {
  sku: string;
  warehouse: string;
  available: number;
  reserved: number;
};

export type Customer = {
  id: string;
  name: string;
  taxId: string;
  email: string;
};

export type SalesOrderLine = {
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export type SalesOrderInput = {
  customerId: string;
  lines: SalesOrderLine[];
  warehouse: string;
};

export type SalesOrder = SalesOrderInput & {
  id: string;
  total: number;
  status: "pending" | "confirmed" | "shipped" | "cancelled";
  createdAt: string;
};

/** Transacción POS tal como la expone el ERP mock (formato OData) */
export type RetailTransaction = {
  TransactionId: string;
  StoreId: string;
  TerminalId: string;
  CashierId: string;
  TransDate: string;
  TotalNeto: number;
  PaymentMethod: string;
  IsVoid: boolean;
  ModifiedDateTime: string;
  Lines: RetailTransactionLine[];
};

export type RetailTransactionLine = {
  LineNum: number;
  Sku: string;
  ProductName: string;
  Quantity: number;
  UnitPrice: number;
  LineTotal: number;
};

export type QueryOptions = {
  filter?: string;
  select?: string[];
  expand?: string[];
  top?: number;
  skip?: number;
  orderBy?: string;
};

/** Contrato del adaptador — idéntico en todos los proyectos */
export interface ErpAdapter {
  getProducts(query: QueryOptions): Promise<Product[]>;
  getStock(itemId: string, warehouse?: string): Promise<StockLevel>;
  getCustomers(query: QueryOptions): Promise<Customer[]>;
  createSalesOrder(order: SalesOrderInput): Promise<SalesOrder>;
  getRetailTransactions(query: QueryOptions): Promise<RetailTransaction[]>;
}
