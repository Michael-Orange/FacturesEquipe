// Reference: javascript_database blueprint
import {
  userTokens,
  suppliers,
  projects,
  invoices,
  adminConfig,
  categories,
  payments,
  type UserToken,
  type InsertUserToken,
  type Supplier,
  type InsertSupplier,
  type Project,
  type InsertProject,
  type Invoice,
  type InsertInvoice,
  type InvoiceWithDetails,
  type InvoiceWithPayments,
  type AdminConfig,
  type InsertAdminConfig,
  type Category,
  type Payment,
  type InsertPayment,
  type PaymentStatus,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, inArray, isNull, ne, asc, and } from "drizzle-orm";

export interface InvoiceFilters {
  type?: 'expense' | 'supplier_invoice' | 'all';
  categoryId?: number | 'all';
  hasBrs?: boolean;
  isStockPurchase?: boolean;
  paymentStatus?: 'paid' | 'partial' | 'unpaid' | 'all';
  sortBy?: 'date' | 'supplier' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Generates an expense number in format DEP-UU-YYMM-XXX
 * UU = first 2 letters of userName (uppercase)
 * YYMM = year (2 digits) + month (2 digits) from invoiceDate
 * XXX = sequence number (001, 002, etc.) per user per month
 */
export async function generateExpenseNumber(userName: string, invoiceDate: Date): Promise<string> {
  // Get first 2 letters of user name, uppercase, remove accents
  const userPrefix = userName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .substring(0, 2)
    .toUpperCase();

  // Format YYMM from invoice date
  const year = invoiceDate.getFullYear().toString().slice(-2);
  const month = (invoiceDate.getMonth() + 1).toString().padStart(2, "0");
  const yearMonth = `${year}${month}`;

  // Build prefix for search
  const prefix = `DEP-${userPrefix}-${yearMonth}-`;

  // Find the last expense number for this user and month
  const result = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(
      and(
        eq(invoices.userName, userName),
        eq(invoices.invoiceType, "expense"),
        sql`${invoices.invoiceNumber} LIKE ${prefix + '%'}`
      )
    )
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);

  let sequence = 1;
  if (result.length > 0 && result[0].invoiceNumber) {
    // Extract last 3 digits and increment
    const lastNumber = result[0].invoiceNumber;
    const lastSequence = parseInt(lastNumber.slice(-3), 10);
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  // Format sequence with padding (001, 002, etc.)
  const sequenceStr = sequence.toString().padStart(3, "0");

  return `${prefix}${sequenceStr}`;
}

export interface IStorage {
  // User tokens
  getUserTokenByToken(token: string): Promise<UserToken | undefined>;
  getAllUserTokens(): Promise<UserToken[]>;
  createUserToken(token: InsertUserToken): Promise<UserToken>;

  // Suppliers
  getAllSuppliers(): Promise<Supplier[]>;
  getSupplierById(id: string): Promise<Supplier | undefined>;
  getSupplierByName(name: string): Promise<Supplier | undefined>;
  getTopVolumeSuppliers(limit: number): Promise<Supplier[]>;
  getRecentSuppliersByUser(userName: string, limit: number): Promise<Supplier[]>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;

  // Categories
  getAllCategories(): Promise<Category[]>;
  getCategoryById(id: number): Promise<Category | undefined>;
  getCategoryByAccountCode(accountCode: string): Promise<Category | undefined>;

  // Projects
  getAllProjects(): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | undefined>;

  // Invoices
  getInvoicesByUser(userName: string): Promise<InvoiceWithDetails[]>;
  getInvoicesByUserWithFilters(userName: string, filters: InvoiceFilters): Promise<InvoiceWithDetails[]>;
  getAllInvoices(): Promise<InvoiceWithDetails[]>;
  getAllInvoicesIncludingArchived(): Promise<InvoiceWithDetails[]>;
  getInvoiceById(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<void>;
  deleteAllInvoices(): Promise<void>;

  // Admin
  getAdminConfig(): Promise<AdminConfig | undefined>;
  createAdminConfig(config: InsertAdminConfig): Promise<AdminConfig>;

  // Payments
  getPaymentsByInvoiceId(invoiceId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getTotalPaidForInvoice(invoiceId: string): Promise<number>;
  updateInvoicePaymentStatus(invoiceId: string): Promise<Invoice | undefined>;
  getInvoiceWithPayments(invoiceId: string): Promise<InvoiceWithPayments | undefined>;
  getInvoicesWithPaymentsByUser(userName: string, filters?: InvoiceFilters): Promise<InvoiceWithPayments[]>;
}

export class DatabaseStorage implements IStorage {
  // User tokens
  async getUserTokenByToken(token: string): Promise<UserToken | undefined> {
    const [userToken] = await db
      .select()
      .from(userTokens)
      .where(eq(userTokens.token, token));
    return userToken || undefined;
  }

  async getAllUserTokens(): Promise<UserToken[]> {
    return await db.select().from(userTokens);
  }

  async createUserToken(insertToken: InsertUserToken): Promise<UserToken> {
    const [token] = await db
      .insert(userTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  // Suppliers
  async getAllSuppliers(): Promise<Supplier[]> {
    return await db.select().from(suppliers).orderBy(suppliers.name);
  }

  async getSupplierById(id: string): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier || undefined;
  }

  async getSupplierByName(name: string): Promise<Supplier | undefined> {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(sql`LOWER(${suppliers.name}) = LOWER(${name})`);
    return supplier || undefined;
  }

  async getTopVolumeSuppliers(limit: number): Promise<Supplier[]> {
    return await db
      .select()
      .from(suppliers)
      .where(ne(suppliers.name, "TOTAL ENERGIES"))
      .orderBy(desc(suppliers.total))
      .limit(limit);
  }

  async getRecentSuppliersByUser(userName: string, limit: number): Promise<Supplier[]> {
    const recentInvoices = await db
      .select({
        supplierId: invoices.supplierId,
        maxDate: sql<string>`MAX(${invoices.createdAt})`.as('maxDate'),
      })
      .from(invoices)
      .where(eq(invoices.userName, userName))
      .groupBy(invoices.supplierId)
      .orderBy(desc(sql`MAX(${invoices.createdAt})`))
      .limit(limit);

    if (recentInvoices.length === 0) return [];

    const supplierIds = recentInvoices.map((r) => r.supplierId);
    const recentSuppliers = await db
      .select()
      .from(suppliers)
      .where(inArray(suppliers.id, supplierIds));

    // Sort by the order in recentInvoices
    const orderMap = new Map(supplierIds.map((id, index) => [id, index]));
    return recentSuppliers.sort((a, b) => {
      return (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0);
    });
  }

  async createSupplier(insertSupplier: InsertSupplier): Promise<Supplier> {
    const [supplier] = await db
      .insert(suppliers)
      .values(insertSupplier)
      .returning();
    return supplier;
  }

  // Categories
  async getAllCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(categories.appName);
  }

  async getCategoryById(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category || undefined;
  }

  async getCategoryByAccountCode(accountCode: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.accountCode, accountCode));
    return category || undefined;
  }

  // Projects
  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(projects.number);
  }

  async getProjectById(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  // Invoices
  async getInvoicesByUser(userName: string): Promise<InvoiceWithDetails[]> {
    const result = await db
      .select({
        id: invoices.id,
        userName: invoices.userName,
        invoiceDate: invoices.invoiceDate,
        supplierId: invoices.supplierId,
        supplierName: suppliers.name,
        supplierIsRegular: suppliers.isRegularSupplier,
        category: invoices.category,
        amountDisplayTTC: invoices.amountDisplayTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        amountRealTTC: invoices.amountRealTTC,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        archive: invoices.archive,
        createdAt: invoices.createdAt,
        // New fields
        invoiceType: invoices.invoiceType,
        invoiceNumber: invoices.invoiceNumber,
        isStockPurchase: invoices.isStockPurchase,
        categoryId: invoices.categoryId,
        hasBrs: invoices.hasBrs,
        // Category join fields
        categoryAppName: categories.appName,
        categoryAccountName: categories.accountName,
        categoryAccountCode: categories.accountCode,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .leftJoin(categories, eq(invoices.categoryId, categories.id))
      .where(sql`${invoices.userName} = ${userName} AND ${invoices.archive} IS NULL`)
      .orderBy(desc(invoices.createdAt));

    // Add backward compatibility display fields
    return result.map(inv => ({
      ...inv,
      displayCategory: inv.categoryAppName || inv.category || 'Non définie',
      displayAmount: inv.amountDisplayTTC,
    })) as InvoiceWithDetails[];
  }

  async getInvoicesByUserWithFilters(userName: string, filters: InvoiceFilters): Promise<InvoiceWithDetails[]> {
    const conditions: any[] = [
      eq(invoices.userName, userName),
      isNull(invoices.archive),
    ];

    if (filters.type && filters.type !== 'all') {
      conditions.push(eq(invoices.invoiceType, filters.type));
    }

    if (filters.categoryId && filters.categoryId !== 'all') {
      conditions.push(eq(invoices.categoryId, filters.categoryId));
    }

    if (filters.hasBrs === true) {
      conditions.push(eq(invoices.hasBrs, true));
    }

    if (filters.isStockPurchase === true) {
      conditions.push(eq(invoices.isStockPurchase, true));
    }

    let orderByClause;
    const sortOrder = filters.sortOrder === 'asc' ? asc : desc;
    
    switch (filters.sortBy) {
      case 'supplier':
        orderByClause = sortOrder(suppliers.name);
        break;
      case 'amount':
        orderByClause = sortOrder(invoices.amountDisplayTTC);
        break;
      case 'date':
      default:
        orderByClause = sortOrder(invoices.invoiceDate);
        break;
    }

    const result = await db
      .select({
        id: invoices.id,
        userName: invoices.userName,
        invoiceDate: invoices.invoiceDate,
        supplierId: invoices.supplierId,
        supplierName: suppliers.name,
        supplierIsRegular: suppliers.isRegularSupplier,
        category: invoices.category,
        amountDisplayTTC: invoices.amountDisplayTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        amountRealTTC: invoices.amountRealTTC,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        archive: invoices.archive,
        createdAt: invoices.createdAt,
        invoiceType: invoices.invoiceType,
        invoiceNumber: invoices.invoiceNumber,
        isStockPurchase: invoices.isStockPurchase,
        categoryId: invoices.categoryId,
        hasBrs: invoices.hasBrs,
        categoryAppName: categories.appName,
        categoryAccountName: categories.accountName,
        categoryAccountCode: categories.accountCode,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .leftJoin(categories, eq(invoices.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(orderByClause);

    return result.map(inv => ({
      ...inv,
      displayCategory: inv.categoryAppName || inv.category || 'Non définie',
      displayAmount: inv.amountDisplayTTC,
    })) as InvoiceWithDetails[];
  }

  async getAllInvoices(): Promise<InvoiceWithDetails[]> {
    const result = await db
      .select({
        id: invoices.id,
        userName: invoices.userName,
        invoiceDate: invoices.invoiceDate,
        supplierId: invoices.supplierId,
        supplierName: suppliers.name,
        supplierIsRegular: suppliers.isRegularSupplier,
        category: invoices.category,
        amountDisplayTTC: invoices.amountDisplayTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        amountRealTTC: invoices.amountRealTTC,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        archive: invoices.archive,
        createdAt: invoices.createdAt,
        // New fields
        invoiceType: invoices.invoiceType,
        invoiceNumber: invoices.invoiceNumber,
        isStockPurchase: invoices.isStockPurchase,
        categoryId: invoices.categoryId,
        hasBrs: invoices.hasBrs,
        // Category join fields
        categoryAppName: categories.appName,
        categoryAccountName: categories.accountName,
        categoryAccountCode: categories.accountCode,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .leftJoin(categories, eq(invoices.categoryId, categories.id))
      .where(isNull(invoices.archive))
      .orderBy(desc(invoices.createdAt));

    return result.map(inv => ({
      ...inv,
      displayCategory: inv.categoryAppName || inv.category || 'Non définie',
      displayAmount: inv.amountDisplayTTC,
    })) as InvoiceWithDetails[];
  }

  async getAllInvoicesIncludingArchived(): Promise<InvoiceWithDetails[]> {
    const result = await db
      .select({
        id: invoices.id,
        userName: invoices.userName,
        invoiceDate: invoices.invoiceDate,
        supplierId: invoices.supplierId,
        supplierName: suppliers.name,
        supplierIsRegular: suppliers.isRegularSupplier,
        category: invoices.category,
        amountDisplayTTC: invoices.amountDisplayTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        amountRealTTC: invoices.amountRealTTC,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        archive: invoices.archive,
        createdAt: invoices.createdAt,
        // New fields
        invoiceType: invoices.invoiceType,
        invoiceNumber: invoices.invoiceNumber,
        isStockPurchase: invoices.isStockPurchase,
        categoryId: invoices.categoryId,
        hasBrs: invoices.hasBrs,
        // Category join fields
        categoryAppName: categories.appName,
        categoryAccountName: categories.accountName,
        categoryAccountCode: categories.accountCode,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .leftJoin(categories, eq(invoices.categoryId, categories.id))
      .orderBy(desc(invoices.createdAt));

    return result.map(inv => ({
      ...inv,
      displayCategory: inv.categoryAppName || inv.category || 'Non définie',
      displayAmount: inv.amountDisplayTTC,
    })) as InvoiceWithDetails[];
  }

  async getInvoiceById(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice || undefined;
  }

  async createInvoice(insertInvoice: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db
      .insert(invoices)
      .values(insertInvoice)
      .returning();
    return invoice;
  }

  async updateInvoice(id: string, updateData: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [invoice] = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, id))
      .returning();
    return invoice || undefined;
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async deleteAllInvoices(): Promise<void> {
    await db.delete(invoices);
  }

  // Admin
  async getAdminConfig(): Promise<AdminConfig | undefined> {
    const [config] = await db.select().from(adminConfig).limit(1);
    return config || undefined;
  }

  async createAdminConfig(insertConfig: InsertAdminConfig): Promise<AdminConfig> {
    const [config] = await db
      .insert(adminConfig)
      .values(insertConfig)
      .returning();
    return config;
  }

  // Payments
  async getPaymentsByInvoiceId(invoiceId: string): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(asc(payments.paymentDate), asc(payments.createdAt));
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values(insertPayment)
      .returning();
    return payment;
  }

  async getTotalPaidForInvoice(invoiceId: string): Promise<number> {
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${payments.amountPaid} AS DECIMAL)), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    return parseFloat(result[0]?.total || "0");
  }

  async updateInvoicePaymentStatus(invoiceId: string): Promise<Invoice | undefined> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) return undefined;

    const totalPaid = await this.getTotalPaidForInvoice(invoiceId);
    const amountToPay = parseFloat(invoice.amountDisplayTTC?.toString() || "0");

    let newStatus: PaymentStatus = "unpaid";
    if (totalPaid >= amountToPay) {
      newStatus = "paid";
    } else if (totalPaid > 0) {
      newStatus = "partial";
    }

    const [updatedInvoice] = await db
      .update(invoices)
      .set({ paymentStatus: newStatus })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return updatedInvoice;
  }

  async getInvoiceWithPayments(invoiceId: string): Promise<InvoiceWithPayments | undefined> {
    // Get invoice with details
    const result = await db
      .select({
        id: invoices.id,
        userName: invoices.userName,
        invoiceDate: invoices.invoiceDate,
        supplierId: invoices.supplierId,
        supplierName: suppliers.name,
        supplierIsRegular: suppliers.isRegularSupplier,
        category: invoices.category,
        amountDisplayTTC: invoices.amountDisplayTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        amountRealTTC: invoices.amountRealTTC,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        archive: invoices.archive,
        createdAt: invoices.createdAt,
        invoiceType: invoices.invoiceType,
        invoiceNumber: invoices.invoiceNumber,
        isStockPurchase: invoices.isStockPurchase,
        categoryId: invoices.categoryId,
        hasBrs: invoices.hasBrs,
        paymentStatus: invoices.paymentStatus,
        categoryAppName: categories.appName,
        categoryAccountName: categories.accountName,
        categoryAccountCode: categories.accountCode,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .leftJoin(categories, eq(invoices.categoryId, categories.id))
      .where(eq(invoices.id, invoiceId));

    if (result.length === 0) return undefined;

    const invoice = result[0];
    const invoicePayments = await this.getPaymentsByInvoiceId(invoiceId);
    const totalPaid = invoicePayments.reduce((sum, p) => sum + parseFloat(p.amountPaid?.toString() || "0"), 0);
    const amountToPay = parseFloat(invoice.amountDisplayTTC?.toString() || "0");

    return {
      ...invoice,
      displayCategory: invoice.categoryAppName || invoice.category || 'Non définie',
      displayAmount: invoice.amountDisplayTTC,
      totalPaid,
      remainingAmount: Math.max(0, amountToPay - totalPaid),
      payments: invoicePayments,
    } as InvoiceWithPayments;
  }

  async getInvoicesWithPaymentsByUser(userName: string, filters?: InvoiceFilters): Promise<InvoiceWithPayments[]> {
    const conditions: any[] = [
      eq(invoices.userName, userName),
      isNull(invoices.archive),
    ];

    if (filters?.type && filters.type !== 'all') {
      conditions.push(eq(invoices.invoiceType, filters.type));
    }

    if (filters?.categoryId && filters.categoryId !== 'all') {
      conditions.push(eq(invoices.categoryId, filters.categoryId));
    }

    if (filters?.hasBrs === true) {
      conditions.push(eq(invoices.hasBrs, true));
    }

    if (filters?.isStockPurchase === true) {
      conditions.push(eq(invoices.isStockPurchase, true));
    }

    if (filters?.paymentStatus && filters.paymentStatus !== 'all') {
      conditions.push(eq(invoices.paymentStatus, filters.paymentStatus));
    }

    let orderByClause;
    const sortOrder = filters?.sortOrder === 'asc' ? asc : desc;
    
    switch (filters?.sortBy) {
      case 'supplier':
        orderByClause = sortOrder(suppliers.name);
        break;
      case 'amount':
        orderByClause = sortOrder(invoices.amountDisplayTTC);
        break;
      case 'date':
      default:
        orderByClause = sortOrder(invoices.invoiceDate);
        break;
    }

    const result = await db
      .select({
        id: invoices.id,
        userName: invoices.userName,
        invoiceDate: invoices.invoiceDate,
        supplierId: invoices.supplierId,
        supplierName: suppliers.name,
        supplierIsRegular: suppliers.isRegularSupplier,
        category: invoices.category,
        amountDisplayTTC: invoices.amountDisplayTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        amountRealTTC: invoices.amountRealTTC,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        archive: invoices.archive,
        createdAt: invoices.createdAt,
        invoiceType: invoices.invoiceType,
        invoiceNumber: invoices.invoiceNumber,
        isStockPurchase: invoices.isStockPurchase,
        categoryId: invoices.categoryId,
        hasBrs: invoices.hasBrs,
        paymentStatus: invoices.paymentStatus,
        categoryAppName: categories.appName,
        categoryAccountName: categories.accountName,
        categoryAccountCode: categories.accountCode,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .leftJoin(categories, eq(invoices.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(orderByClause);

    // Fetch payments for supplier invoices
    const invoiceIds = result
      .filter(inv => inv.invoiceType === 'supplier_invoice')
      .map(inv => inv.id);

    const allPayments = invoiceIds.length > 0 
      ? await db.select().from(payments).where(inArray(payments.invoiceId, invoiceIds))
      : [];

    // Group payments by invoice
    const paymentsByInvoice = new Map<string, Payment[]>();
    for (const payment of allPayments) {
      if (!paymentsByInvoice.has(payment.invoiceId)) {
        paymentsByInvoice.set(payment.invoiceId, []);
      }
      paymentsByInvoice.get(payment.invoiceId)!.push(payment);
    }

    return result.map(inv => {
      const invoicePayments = paymentsByInvoice.get(inv.id) || [];
      const totalPaid = invoicePayments.reduce((sum, p) => sum + parseFloat(p.amountPaid?.toString() || "0"), 0);
      const amountToPay = parseFloat(inv.amountDisplayTTC?.toString() || "0");

      return {
        ...inv,
        displayCategory: inv.categoryAppName || inv.category || 'Non définie',
        displayAmount: inv.amountDisplayTTC,
        totalPaid: inv.invoiceType === 'supplier_invoice' ? totalPaid : undefined,
        remainingAmount: inv.invoiceType === 'supplier_invoice' ? Math.max(0, amountToPay - totalPaid) : undefined,
        payments: inv.invoiceType === 'supplier_invoice' ? invoicePayments : undefined,
      } as InvoiceWithPayments;
    });
  }
}

export const storage = new DatabaseStorage();
