import type {
  SalesInvoice,
  SalesInvoiceLine,
  SalesOrder,
  SalesOrderLine,
  SalesQuote,
  SalesQuoteLine,
} from "@prisma/client";

import { getPrisma } from "../database";
import { newId, parseDateOnly, resolveOrgId, toDateOnlyString } from "./shared";

export type SalesDocStatus = "draft" | "open" | "fulfilled" | "invoiced" | "cancelled";

export type SalesLineDto = {
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type SalesQuoteDto = {
  id: string;
  quoteNumber: string;
  customerCode: string;
  customerName: string;
  lines: SalesLineDto[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: SalesDocStatus;
  validUntil: string;
  createdAt: string;
};

export type SalesOrderDto = {
  id: string;
  orderNumber: string;
  quoteId?: string;
  customerCode: string;
  customerName: string;
  lines: SalesLineDto[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: SalesDocStatus;
  createdAt: string;
};

export type SalesInvoiceDto = {
  id: string;
  invoiceNumber: string;
  orderId?: string;
  customerCode: string;
  customerName: string;
  lines: SalesLineDto[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  terms: string;
  status: SalesDocStatus;
  issuedAt: string;
  dueAt: string;
  amountPaid: number;
  recurring?: boolean;
};

export type SalesStateDto = {
  quotes: SalesQuoteDto[];
  orders: SalesOrderDto[];
  invoices: SalesInvoiceDto[];
};

function lineTotals(lines: SalesLineDto[]): number {
  return lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

function toQuoteDto(row: SalesQuote & { lines: SalesQuoteLine[] }): SalesQuoteDto {
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    customerCode: row.customerCode,
    customerName: row.customerName,
    lines: row.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
    subtotal: row.subtotal,
    tax: row.tax,
    shipping: row.shipping,
    discount: row.discount,
    total: row.total,
    terms: row.terms,
    status: row.status as SalesDocStatus,
    validUntil: toDateOnlyString(row.validUntil),
    createdAt: toDateOnlyString(row.createdAt),
  };
}

function toOrderDto(row: SalesOrder & { lines: SalesOrderLine[] }): SalesOrderDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    quoteId: row.quoteId ?? undefined,
    customerCode: row.customerCode,
    customerName: row.customerName,
    lines: row.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
    subtotal: row.subtotal,
    tax: row.tax,
    shipping: row.shipping,
    discount: row.discount,
    total: row.total,
    terms: row.terms,
    status: row.status as SalesDocStatus,
    createdAt: toDateOnlyString(row.createdAt),
  };
}

function toInvoiceDto(row: SalesInvoice & { lines: SalesInvoiceLine[] }): SalesInvoiceDto {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    orderId: row.orderId ?? undefined,
    customerCode: row.customerCode,
    customerName: row.customerName,
    lines: row.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
    subtotal: row.subtotal,
    tax: row.tax,
    shipping: row.shipping,
    discount: row.discount,
    total: row.total,
    terms: row.terms,
    status: row.status as SalesDocStatus,
    issuedAt: toDateOnlyString(row.issuedAt),
    dueAt: toDateOnlyString(row.dueAt),
    amountPaid: row.amountPaid,
    recurring: row.isRecurring,
  };
}

export async function getSalesState(orgId = resolveOrgId()): Promise<SalesStateDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const [quotes, orders, invoices] = await Promise.all([
    db.salesQuote.findMany({ where: { orgId: org }, include: { lines: true }, orderBy: { createdAt: "desc" } }),
    db.salesOrder.findMany({ where: { orgId: org }, include: { lines: true }, orderBy: { createdAt: "desc" } }),
    db.salesInvoice.findMany({ where: { orgId: org }, include: { lines: true }, orderBy: { issuedAt: "desc" } }),
  ]);
  return {
    quotes: quotes.map(toQuoteDto),
    orders: orders.map(toOrderDto),
    invoices: invoices.map(toInvoiceDto),
  };
}

export async function createQuote(orgId: string, quote: SalesQuoteDto): Promise<SalesQuoteDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const count = await db.salesQuote.count({ where: { orgId: org } });
  const subtotal = lineTotals(quote.lines);
  const total = subtotal + quote.tax + quote.shipping - quote.discount;
  const id = quote.id || newId("qt");
  const quoteNumber =
    quote.quoteNumber?.trim() ||
    `QT-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const row = await db.$transaction(async (tx) => {
    const created = await tx.salesQuote.create({
      data: {
        id,
        orgId: org,
        quoteNumber,
        customerCode: quote.customerCode,
        customerName: quote.customerName,
        subtotal,
        tax: quote.tax,
        shipping: quote.shipping,
        discount: quote.discount,
        total,
        terms: quote.terms,
        status: quote.status,
        validUntil: parseDateOnly(quote.validUntil),
        createdAt: parseDateOnly(quote.createdAt || new Date().toISOString().slice(0, 10)),
      },
    });
    for (const line of quote.lines) {
      const sku = line.sku?.trim();
      if (!sku) throw new Error(`Quote line missing SKU on ${quoteNumber}.`);
      await tx.salesQuoteLine.create({
        data: {
          quoteId: created.id,
          sku,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
        },
      });
    }
    return tx.salesQuote.findUnique({ where: { id: created.id }, include: { lines: true } });
  });

  if (!row) throw new Error("Quote create failed.");
  return toQuoteDto(row);
}

export async function convertQuoteToOrder(orgId: string, quoteId: string): Promise<SalesOrderDto | null> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const quote = await db.salesQuote.findFirst({
    where: { id: quoteId, orgId: org },
    include: { lines: true },
  });
  if (!quote) return null;

  const count = await db.salesOrder.count({ where: { orgId: org } });
  const orderId = newId("so");

  const row = await db.$transaction(async (tx) => {
    await tx.salesQuote.update({ where: { id: quoteId }, data: { status: "fulfilled" } });
    const order = await tx.salesOrder.create({
      data: {
        id: orderId,
        orgId: org,
        orderNumber: `SO-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        quoteId,
        customerCode: quote.customerCode,
        customerName: quote.customerName,
        subtotal: quote.subtotal,
        tax: quote.tax,
        shipping: quote.shipping,
        discount: quote.discount,
        total: quote.total,
        terms: quote.terms,
        status: "open",
        createdAt: parseDateOnly(new Date().toISOString().slice(0, 10)),
      },
    });
    for (const line of quote.lines) {
      await tx.salesOrderLine.create({
        data: {
          orderId: order.id,
          sku: line.sku,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
        },
      });
    }
    return tx.salesOrder.findUnique({ where: { id: order.id }, include: { lines: true } });
  });

  return row ? toOrderDto(row) : null;
}

export async function convertOrderToInvoice(orgId: string, orderId: string): Promise<SalesInvoiceDto | null> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const order = await db.salesOrder.findFirst({
    where: { id: orderId, orgId: org },
    include: { lines: true },
  });
  if (!order) return null;

  const due = new Date();
  due.setDate(due.getDate() + 30);
  const count = await db.salesInvoice.count({ where: { orgId: org } });
  const invoiceId = newId("si");

  const row = await db.$transaction(async (tx) => {
    await tx.salesOrder.update({ where: { id: orderId }, data: { status: "invoiced" } });
    const invoice = await tx.salesInvoice.create({
      data: {
        id: invoiceId,
        orgId: org,
        invoiceNumber: `SI-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        orderId,
        customerCode: order.customerCode,
        customerName: order.customerName,
        subtotal: order.subtotal,
        tax: order.tax,
        shipping: order.shipping,
        discount: order.discount,
        total: order.total,
        terms: order.terms,
        status: "open",
        issuedAt: parseDateOnly(new Date().toISOString().slice(0, 10)),
        dueAt: parseDateOnly(due.toISOString().slice(0, 10)),
        amountPaid: 0,
        isRecurring: false,
      },
    });
    for (const line of order.lines) {
      await tx.salesInvoiceLine.create({
        data: {
          invoiceId: invoice.id,
          sku: line.sku,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
        },
      });
    }
    return tx.salesInvoice.findUnique({ where: { id: invoice.id }, include: { lines: true } });
  });

  return row ? toInvoiceDto(row) : null;
}
