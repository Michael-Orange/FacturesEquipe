import { db } from "./db";
import { userTokens, suppliers, projects, adminConfig, paymentMethodsMapping } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import Papa from "papaparse";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";

interface SupplierCSV {
  societe: string;
  total: string;
}

interface ProjectCSV {
  "#": string;
  Nom: string;
  "Début": string;
}

async function applyPaymentMappingMigrations() {
  // Update zoho_name values to match new Zoho Books account names
  const updates = [
    { oldName: "Banques - autres (Wave Business Principal)", newName: "Wave Business Principal" },
    { oldName: "Banques - autres (Wave Business Caisse)", newName: "Wave Business Caisse" },
    { oldName: "Caisse en monnaie nationale", newName: "Caisse Espèces Shift Climat" },
    { oldName: "Caisse - Fatou", newName: "Caisse Espèces Fatou" },
  ];

  for (const { oldName, newName } of updates) {
    await db
      .update(paymentMethodsMapping)
      .set({ zohoName: newName })
      .where(eq(paymentMethodsMapping.zohoName, oldName));
  }

  // Insert missing rows if they don't exist
  const missingRows = [
    { appName: "Wave/Espèces de Fatou", zohoName: "Caisse Espèces Fatou" },
    { appName: "Chèque", zohoName: "Banque Atlantique - Compte principal" },
    { appName: "CB", zohoName: "Banque Atlantique - Compte principal" },
  ];

  for (const row of missingRows) {
    const existing = await db
      .select()
      .from(paymentMethodsMapping)
      .where(eq(paymentMethodsMapping.appName, row.appName))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(paymentMethodsMapping).values(row);
      console.log(`✓ Inserted payment mapping: ${row.appName}`);
    }
  }
}

async function applyProjectClientNameMigration() {
  await db.execute(sql.raw(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT
  `));
}

async function applySupplierCreatedByMigration() {
  // Step 1: Add the column if it doesn't exist yet (for production environments)
  await db.execute(sql.raw(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by VARCHAR REFERENCES user_tokens(id)
  `));

  // Step 2: Backfill created_by for suppliers that have invoices but no creator set yet
  // We attribute the first invoice submitter as the supplier creator
  const updated = await db.execute(sql.raw(`
    UPDATE suppliers s
    SET created_by = ut.id
    FROM user_tokens ut
    WHERE s.created_by IS NULL
      AND LOWER(ut.name) = LOWER((
        SELECT i.user_name FROM invoices i
        WHERE i.supplier_id = s.id
        ORDER BY i.created_at ASC
        LIMIT 1
      ))
  `));
  const count = (updated as any).rowCount ?? (updated as any).count ?? 0;
  if (count > 0) {
    console.log(`✓ Backfilled created_by for ${count} suppliers`);
  }
}

async function seed() {
  console.log("🌱 Starting database seeding...");

  try {
    // Check if already seeded
    const existingTokens = await db.select().from(userTokens).limit(1);
    const existingSuppliers = await db.select().from(suppliers).limit(1);
    const existingProjects = await db.select().from(projects).limit(1);
    
    // Always apply migrations (runs on every startup)
    await applyPaymentMappingMigrations();
    await applySupplierCreatedByMigration();
    await applyProjectClientNameMigration();

    if (existingTokens.length > 0 && existingSuppliers.length > 0 && existingProjects.length > 0) {
      console.log("✓ Database already seeded");
      
      // Print access URLs
      const tokens = await db.select().from(userTokens);
      console.log("\n📋 Access URLs:");
      tokens.forEach((token) => {
        console.log(`  ${token.name}: /${token.name.toLowerCase()}_${token.token}`);
      });
      
      return;
    }

    // 1. Create user tokens
    let tokens;
    if (existingTokens.length === 0) {
      console.log("📝 Creating user tokens...");
      tokens = [
        {
          name: "Michael",
          token: randomBytes(2).toString("hex").substring(0, 3),
          email: "michael@filtreplante.com",
          driveFolderId: "1WcWKj_xHWlfjBub4GZoQTywKztIFRPlx",
        },
        {
          name: "Marine",
          token: randomBytes(2).toString("hex").substring(0, 3),
          email: "marine@filtreplante.com",
          driveFolderId: "16rkQSdjnsuzyVJvnW70jM7nkEkHR7_Q2",
        },
        {
          name: "Fatou",
          token: randomBytes(2).toString("hex").substring(0, 3),
          email: "fatou@filtreplante.com",
          driveFolderId: "1TZU-Reonldk3_ELSDB9LlG_EOI6aKxLA",
        },
      ];

      await db.insert(userTokens).values(tokens);
      console.log("✓ User tokens created");
      console.log("\n📋 Access URLs:");
      tokens.forEach((token) => {
        console.log(`  ${token.name}: /${token.name.toLowerCase()}_${token.token}`);
      });
    } else {
      console.log("✓ User tokens already exist");
      tokens = await db.select().from(userTokens);
      console.log("\n📋 Access URLs:");
      tokens.forEach((token) => {
        console.log(`  ${token.name}: /${token.name.toLowerCase()}_${token.token}`);
      });
    }

    // 2. Create admin config
    const existingAdmin = await db.select().from(adminConfig).limit(1);
    if (existingAdmin.length === 0) {
      console.log("\n🔐 Creating admin config...");
      const adminPassword = "Fplante@Fac1!";
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await db.insert(adminConfig).values({ passwordHash });
      console.log("✓ Admin config created");
    } else {
      console.log("\n✓ Admin config already exists");
    }

    // 3. Load and insert suppliers from CSV
    if (existingSuppliers.length === 0) {
      console.log("\n📦 Loading suppliers from CSV...");
      const suppliersCSVPath = path.join(process.cwd(), "attached_assets", "Fournisseurs_1762003533307.csv");
      const suppliersCSVContent = fs.readFileSync(suppliersCSVPath, "utf-8");
      const suppliersParsed = Papa.parse<SupplierCSV>(suppliersCSVContent, {
        header: true,
        skipEmptyLines: true,
      });

      // Remove duplicates and filter valid suppliers
      const seenNames = new Set<string>();
      const supplierData = suppliersParsed.data
        .filter((row) => {
          if (!row.societe || !row.societe.trim()) return false;
          const name = row.societe.trim();
          if (seenNames.has(name.toLowerCase())) return false;
          seenNames.add(name.toLowerCase());
          return true;
        })
        .map((row) => ({
          name: row.societe.trim(),
          total: row.total || "0",
        }));

      if (supplierData.length > 0) {
        await db.insert(suppliers).values(supplierData);
        console.log(`✓ Inserted ${supplierData.length} suppliers (${suppliersParsed.data.length - supplierData.length} duplicates skipped)`);
      }
    } else {
      console.log("\n✓ Suppliers already loaded");
    }

    // 4. Load and insert projects from CSV
    if (existingProjects.length === 0) {
      console.log("\n📁 Loading projects from CSV...");
      const projectsCSVPath = path.join(process.cwd(), "attached_assets", "Projets_1762003533306.csv");
      const projectsCSVContent = fs.readFileSync(projectsCSVPath, "utf-8");
      const projectsParsed = Papa.parse<ProjectCSV>(projectsCSVContent, {
        header: true,
        skipEmptyLines: true,
      });

      const projectData = projectsParsed.data
        .filter((row) => row["#"] && row.Nom)
        .map((row) => ({
          number: row["#"].trim(),
          name: row.Nom.trim(),
          startDate: row["Début"]?.trim() || null,
        }));

      if (projectData.length > 0) {
        await db.insert(projects).values(projectData);
        console.log(`✓ Inserted ${projectData.length} projects`);
      }
    } else {
      console.log("\n✓ Projects already loaded");
    }

    console.log("\n✨ Database seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

export async function seedDatabase() {
  await seed();
}
