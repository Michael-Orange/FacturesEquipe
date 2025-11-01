// Reference: javascript_database blueprint
import {
  userTokens,
  suppliers,
  projects,
  invoices,
  adminConfig,
  type UserToken,
  type InsertUserToken,
  type Supplier,
  type InsertSupplier,
  type Project,
  type InsertProject,
  type Invoice,
  type InsertInvoice,
  type InvoiceWithDetails,
  type AdminConfig,
  type InsertAdminConfig,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User tokens
  getUserTokenByToken(token: string): Promise<UserToken | undefined>;
  createUserToken(token: InsertUserToken): Promise<UserToken>;

  // Suppliers
  getAllSuppliers(): Promise<Supplier[]>;
  getSupplierById(id: string): Promise<Supplier | undefined>;
  getSupplierByName(name: string): Promise<Supplier | undefined>;
  getTopVolumeSuppliers(limit: number): Promise<Supplier[]>;
  getRecentSuppliersByUser(userName: string, limit: number): Promise<Supplier[]>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;

  // Projects
  getAllProjects(): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | undefined>;

  // Invoices
  getInvoicesByUser(userName: string): Promise<InvoiceWithDetails[]>;
  getAllInvoices(): Promise<InvoiceWithDetails[]>;
  getInvoiceById(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<void>;
  deleteAllInvoices(): Promise<void>;

  // Admin
  getAdminConfig(): Promise<AdminConfig | undefined>;
  createAdminConfig(config: InsertAdminConfig): Promise<AdminConfig>;
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
      .where(sql`${suppliers.id} = ANY(${supplierIds})`);

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
        category: invoices.category,
        amountTTC: invoices.amountTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .where(eq(invoices.userName, userName))
      .orderBy(desc(invoices.createdAt));

    return result as InvoiceWithDetails[];
  }

  async getAllInvoices(): Promise<InvoiceWithDetails[]> {
    const result = await db
      .select({
        id: invoices.id,
        userName: invoices.userName,
        invoiceDate: invoices.invoiceDate,
        supplierId: invoices.supplierId,
        supplierName: suppliers.name,
        category: invoices.category,
        amountTTC: invoices.amountTTC,
        vatApplicable: invoices.vatApplicable,
        amountHT: invoices.amountHT,
        description: invoices.description,
        paymentType: invoices.paymentType,
        projectId: invoices.projectId,
        projectNumber: projects.number,
        projectName: projects.name,
        fileName: invoices.fileName,
        filePath: invoices.filePath,
        driveFileId: invoices.driveFileId,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
      .leftJoin(projects, eq(invoices.projectId, projects.id))
      .orderBy(desc(invoices.createdAt));

    return result as InvoiceWithDetails[];
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
}

export const storage = new DatabaseStorage();
