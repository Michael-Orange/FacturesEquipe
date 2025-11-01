import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Projects from CSV
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  number: text("number").notNull().unique(),
  name: text("name").notNull(),
  startDate: text("start_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invoices submitted by users
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userName: text("user_name").notNull(),
  invoiceDate: timestamp("invoice_date").notNull(),
  supplierId: varchar("supplier_id").references(() => suppliers.id).notNull(),
  category: text("category").notNull(), // Restauration, Essence, etc.
  amountTTC: decimal("amount_ttc", { precision: 12, scale: 2 }).notNull(),
  vatApplicable: boolean("vat_applicable").default(false),
  amountHT: decimal("amount_ht", { precision: 12, scale: 2 }),
  description: text("description").notNull(),
  paymentType: text("payment_type").notNull(), // Wave, Espèces, Espèces remboursés par Wave Business
  projectId: varchar("project_id").references(() => projects.id),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(), // Google Drive path/ID
  driveFileId: text("drive_file_id").notNull(),
  archive: varchar("archive"), // YYMMDD format (e.g., "251101"), null if not archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Admin configuration
export const adminConfig = pgTable("admin_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  passwordHash: text("password_hash").notNull(),
});

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

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
}).extend({
  invoiceDate: z.string().or(z.date()),
  amountTTC: z.string().or(z.number()),
  amountHT: z.string().or(z.number()).optional().nullable(),
  projectId: z.string().optional().nullable(),
  fileName: z.string().optional(),
  filePath: z.string().optional(),
  driveFileId: z.string().optional(),
});

export const insertAdminConfigSchema = createInsertSchema(adminConfig).omit({
  id: true,
});

// Types
export type UserToken = typeof userTokens.$inferSelect;
export type InsertUserToken = z.infer<typeof insertUserTokenSchema>;

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type AdminConfig = typeof adminConfig.$inferSelect;
export type InsertAdminConfig = z.infer<typeof insertAdminConfigSchema>;

// Invoice with joined data for frontend
export type InvoiceWithDetails = Invoice & {
  supplierName: string;
  projectNumber?: string;
  projectName?: string;
};
