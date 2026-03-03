import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, boolean, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User tokens for access control (Michael, Marine, Fatou)
export const userTokens = pgTable("user_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  driveFolderId: text("drive_folder_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Suppliers from CSV + new ones added
export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  total: decimal("total", { precision: 12, scale: 2 }).default("0"),
  isRegularSupplier: boolean("is_regular_supplier").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => userTokens.id),
});

// Projects from CSV
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  number: text("number").notNull().unique(),
  name: text("name").notNull(),
  startDate: text("start_date"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Categories from Zoho accounting plan
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  zohoAccountId: varchar("zoho_account_id", { length: 50 }),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  appName: varchar("app_name", { length: 255 }).notNull(),
  accountCode: varchar("account_code", { length: 50 }).notNull(),
  description: text("description"),
  accountType: varchar("account_type", { length: 50 }),
  currency: varchar("currency", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invoices submitted by users
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userName: text("user_name").notNull(),
  invoiceDate: timestamp("invoice_date").notNull(),
  supplierId: varchar("supplier_id").references(() => suppliers.id).notNull(),
  category: text("category").notNull(), // Legacy field - Restauration, Essence, etc.
  amountDisplayTTC: decimal("amount_display_ttc", { precision: 12, scale: 2 }).notNull(),
  vatApplicable: boolean("vat_applicable").default(false),
  amountHT: decimal("amount_ht", { precision: 12, scale: 2 }),
  description: text("description").notNull(),
  paymentType: text("payment_type").notNull(), // Wave, Espèces, Espèces remboursés par Wave Business
  projectId: varchar("project_id").references(() => projects.id),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(), // Google Drive path/ID
  driveFileId: text("drive_file_id").notNull(),
  archive: varchar("archive"), // YYMMDD format (e.g., "251101"), null if not archived
  // New fields for enhanced invoice form
  invoiceType: varchar("invoice_type", { length: 50 }), // Ticket de caisse, Facture Fournisseur, Facture Simplifiée
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  isStockPurchase: boolean("is_stock_purchase").default(false),
  categoryId: integer("category_id").references(() => categories.id), // Reference to categories table
  hasBrs: boolean("has_brs").default(false), // Has BRS (Bon de Réception de Stock)
  amountRealTTC: decimal("amount_real_ttc", { precision: 12, scale: 2 }), // Real amount for accounting
  paymentStatus: varchar("payment_status", { length: 20 }).default("unpaid"), // unpaid | partial | paid
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Admin configuration
export const adminConfig = pgTable("admin_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  passwordHash: text("password_hash").notNull(),
});

// Payment methods mapping for Zoho exports
export const paymentMethodsMapping = pgTable("payment_methods_mapping", {
  id: serial("id").primaryKey(),
  appName: varchar("app_name", { length: 100 }).notNull().unique(),
  zohoName: varchar("zoho_name", { length: 150 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Payments for supplier invoices (multiple payments tracking)
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).notNull(),
  paymentDate: varchar("payment_date", { length: 10 }).notNull(), // YYYY-MM-DD format
  paymentType: varchar("payment_type", { length: 100 }).notNull(),
  createdBy: varchar("created_by").references(() => userTokens.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  invoiceIdIdx: index("payments_invoice_id_idx").on(table.invoiceId),
}));

// Insert schemas
export const insertUserTokenSchema = createInsertSchema(userTokens).omit({
  id: true,
  createdAt: true,
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
}).extend({
  invoiceDate: z.string().or(z.date()),
  amountDisplayTTC: z.string().or(z.number()),
  amountHT: z.string().or(z.number()).optional().nullable(),
  projectId: z.string().optional().nullable(),
  fileName: z.string().optional(),
  filePath: z.string().optional(),
  driveFileId: z.string().optional(),
  // New optional fields
  invoiceType: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  isStockPurchase: z.boolean().optional(),
  categoryId: z.number().optional().nullable(),
  hasBrs: z.boolean().optional(),
  amountRealTTC: z.string().or(z.number()).optional().nullable(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional().nullable(),
});

export const insertAdminConfigSchema = createInsertSchema(adminConfig).omit({
  id: true,
});

export const insertPaymentMethodsMappingSchema = createInsertSchema(paymentMethodsMapping).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
}).extend({
  amountPaid: z.string().or(z.number()),
});

// Types
export type UserToken = typeof userTokens.$inferSelect;
export type InsertUserToken = z.infer<typeof insertUserTokenSchema>;

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type AdminConfig = typeof adminConfig.$inferSelect;
export type InsertAdminConfig = z.infer<typeof insertAdminConfigSchema>;

export type PaymentMethodsMapping = typeof paymentMethodsMapping.$inferSelect;
export type InsertPaymentMethodsMapping = z.infer<typeof insertPaymentMethodsMappingSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// Invoice with joined data for frontend
export type InvoiceWithDetails = Invoice & {
  supplierName: string;
  supplierIsRegular?: boolean;
  projectNumber?: string;
  projectName?: string;
  // Category join fields
  categoryAppName?: string;
  categoryAccountName?: string;
  categoryAccountCode?: string;
  // Computed display fields for backward compatibility
  displayCategory?: string;
  displayAmount?: string;
};

// Invoice with payments for supplier invoices
export type InvoiceWithPayments = InvoiceWithDetails & {
  totalPaid?: number;
  remainingAmount?: number;
  payments?: Payment[];
};

// Payment status type
export type PaymentStatus = "unpaid" | "partial" | "paid";
