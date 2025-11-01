import { db } from "./db";
import { userTokens, suppliers, projects, adminConfig } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import Papa from "papaparse";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";

interface SupplierCSV {
  societe: string;
  total: string;
}

interface ProjectCSV {
  "#": string;
  Nom: string;
  "Début": string;
}

async function seed() {
  console.log("🌱 Starting database seeding...");

  try {
    // Check if already seeded
    const existingTokens = await db.select().from(userTokens).limit(1);
    const existingSuppliers = await db.select().from(suppliers).limit(1);
    const existingProjects = await db.select().from(projects).limit(1);
    
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

seed()
  .then(() => {
    console.log("\n🎉 Seeding finished!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
