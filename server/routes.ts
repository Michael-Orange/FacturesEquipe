import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { uploadFileToDrive, deleteFileFromDrive, downloadFileFromDrive, archiveUserFiles } from "./integrations/google-drive";
import { sendInvoiceConfirmation } from "./integrations/resend";
import { insertInvoiceSchema, insertSupplierSchema, invoices } from "@shared/schema";
import { isNull } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { generateFileName } from "./utils";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Validate token
  app.get("/api/validate-token/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const userToken = await storage.getUserTokenByToken(token);

      if (!userToken) {
        return res.status(401).json({ message: "Invalid token" });
      }

      res.json({
        name: userToken.name,
        email: userToken.email,
      });
    } catch (error) {
      console.error("Error validating token:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all suppliers
  app.get("/api/suppliers", async (req: Request, res: Response) => {
    try {
      const suppliers = await storage.getAllSuppliers();
      res.json(suppliers);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get recent suppliers for a user
  app.get("/api/suppliers/recent/:userName", async (req: Request, res: Response) => {
    try {
      const { userName } = req.params;
      const suppliers = await storage.getRecentSuppliersByUser(userName, 5);
      res.json(suppliers);
    } catch (error) {
      console.error("Error fetching recent suppliers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get top volume suppliers
  app.get("/api/suppliers/top-volume", async (req: Request, res: Response) => {
    try {
      const suppliers = await storage.getTopVolumeSuppliers(5);
      res.json(suppliers);
    } catch (error) {
      console.error("Error fetching top volume suppliers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create supplier
  app.post("/api/suppliers", async (req: Request, res: Response) => {
    try {
      const parsed = insertSupplierSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid supplier data", errors: parsed.error });
      }

      // Check if supplier already exists
      const existing = await storage.getSupplierByName(parsed.data.name);
      if (existing) {
        return res.status(409).json({ message: "Supplier already exists" });
      }

      const supplier = await storage.createSupplier(parsed.data);
      res.status(201).json(supplier);
    } catch (error) {
      console.error("Error creating supplier:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all projects
  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      const projects = await storage.getAllProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all categories (sorted by app_name)
  app.get("/api/categories", async (req: Request, res: Response) => {
    try {
      const categories = await storage.getAllCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get invoices for a user
  app.get("/api/invoices/:userName", async (req: Request, res: Response) => {
    try {
      const { userName } = req.params;
      const invoices = await storage.getInvoicesByUser(userName);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export user invoices as CSV
  app.get("/api/invoices/:userName/export-csv", async (req: Request, res: Response) => {
    try {
      const { userName } = req.params;
      const token = req.query.token as string;

      // Validate token
      if (!token) {
        return res.status(401).json({ message: "Token required" });
      }

      const userToken = await storage.getUserTokenByToken(token);
      if (!userToken) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // Verify that token owner matches the requested userName
      if (userToken.name !== userName) {
        return res.status(403).json({ message: "Token does not match user name" });
      }

      const invoices = await storage.getInvoicesByUser(userName);

      // CSV header
      const csvHeader = "Date;Fournisseur;Catégorie;Montant TTC;TVA;Montant HT;Description;Mode de paiement;Projet\n";
      
      const csvRows = invoices.map((inv) => {
        const invoiceDate = format(new Date(inv.invoiceDate), "dd/MM/yyyy", { locale: fr });
        const tva = inv.vatApplicable ? "Oui" : "Non";
        const montantHT = inv.amountHT || "";
        const description = inv.description || "";
        const projet = inv.projectNumber ? `${inv.projectNumber} - ${inv.projectName}` : "";

        return [
          invoiceDate,
          inv.supplierName,
          inv.category,
          inv.amountDisplayTTC,
          tva,
          montantHT,
          description,
          inv.paymentType,
          projet,
        ]
          .map((field) => `"${field}"`)
          .join(";");
      });

      const csv = csvHeader + csvRows.join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="mes_factures_${userName.toLowerCase()}_${format(new Date(), "yyyy-MM-dd")}.csv"`);
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting user CSV:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create invoice with file upload
  app.post("/api/invoices", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "File is required" });
      }

      const {
        userName,
        invoiceDate,
        supplierId,
        category, // Legacy field for backward compatibility
        amountDisplayTTC,
        vatApplicable,
        description,
        paymentType,
        projectId,
        // New fields
        isStockPurchase,
        categoryId,
        hasBrs,
        invoiceType,
        invoiceNumber,
      } = req.body;

      // Parse boolean and numeric values from form data
      const parsedAmountDisplayTTC = parseFloat(amountDisplayTTC);
      const parsedVatApplicable = vatApplicable === "true" || vatApplicable === true;
      const parsedIsStockPurchase = isStockPurchase === "true" || isStockPurchase === true;
      const parsedHasBrs = hasBrs === "true" || hasBrs === true;
      const parsedCategoryId = categoryId ? parseInt(categoryId, 10) : null;

      // ==================== VALIDATION 1: Required fields ====================
      if (!parsedAmountDisplayTTC || parsedAmountDisplayTTC <= 0) {
        return res.status(400).json({ message: "Montant TTC obligatoire et doit être supérieur à 0" });
      }

      if (!supplierId) {
        return res.status(400).json({ message: "Fournisseur obligatoire" });
      }

      // Get supplier to validate and check is_regular_supplier
      const supplier = await storage.getSupplierById(supplierId);
      if (!supplier) {
        return res.status(400).json({ message: "Fournisseur introuvable" });
      }

      // For new invoices with categoryId, validate it exists
      let categoryData = null;
      if (parsedCategoryId) {
        categoryData = await storage.getCategoryById(parsedCategoryId);
        if (!categoryData) {
          return res.status(400).json({ message: "Catégorie introuvable" });
        }
      }

      // If invoiceType is provided (new form), validate it
      if (invoiceType && !['expense', 'supplier_invoice'].includes(invoiceType)) {
        return res.status(400).json({ message: "Type de facture invalide (expense ou supplier_invoice)" });
      }

      // ==================== VALIDATION 2: Invoice number required for supplier_invoice ====================
      let finalInvoiceNumber = invoiceNumber;
      if (invoiceType === 'supplier_invoice') {
        if (!invoiceNumber || invoiceNumber.trim() === '') {
          return res.status(400).json({ message: "Numéro de facture obligatoire pour les Factures Fournisseur" });
        }
      } else if (invoiceType === 'expense') {
        finalInvoiceNumber = null; // Force NULL for expenses
      }

      // ==================== VALIDATION 3: Stock purchase category consistency ====================
      if (parsedIsStockPurchase && parsedCategoryId) {
        const stockCategory = await storage.getCategoryByAccountCode('3210000000');
        if (!stockCategory || parsedCategoryId !== stockCategory.id) {
          return res.status(400).json({ 
            message: "Pour un achat stock, la catégorie doit être 'Stock - achats de matériaux'" 
          });
        }
      }

      // ==================== VALIDATION 4: BRS only for Prestation de services + TVA=Non ====================
      if (parsedHasBrs) {
        if (parsedVatApplicable) {
          return res.status(400).json({ 
            message: "BRS applicable uniquement pour Prestation de services sans TVA" 
          });
        }
        if (categoryData && categoryData.accountName !== "Achats d'études et prestations de services") {
          return res.status(400).json({ 
            message: "BRS applicable uniquement pour Prestation de services sans TVA" 
          });
        }
      }

      // ==================== VALIDATION 5: Invoice type forcing rules ====================
      if (invoiceType && categoryData) {
        // CASE 1: Must be supplier_invoice
        const mustBeSupplierInvoice = 
          parsedAmountDisplayTTC >= 500000 ||
          supplier.isRegularSupplier === true ||
          parsedHasBrs === true;

        if (mustBeSupplierInvoice && invoiceType !== 'supplier_invoice') {
          return res.status(400).json({ 
            message: "Type de facture doit être 'Facture Fournisseur' (montant >= 500k, fournisseur régulier, ou BRS)" 
          });
        }

        // CASE 2: Must be expense for Restaurant/Essence categories
        const mustBeExpense = 
          categoryData.accountName === 'Réceptions' ||
          categoryData.accountName === 'Fournitures non stockables - Energies';

        if (mustBeExpense && invoiceType !== 'expense') {
          return res.status(400).json({ 
            message: "Type de facture doit être 'Dépense' pour les catégories Restaurant et Essence" 
          });
        }
      }

      // ==================== SERVER-SIDE CALCULATIONS ====================
      // Calculate amount_ht (TVA 18%)
      let calculatedAmountHT: number | null = null;
      if (parsedVatApplicable) {
        calculatedAmountHT = Math.round((parsedAmountDisplayTTC / 1.18) * 100) / 100;
      }

      // Calculate amount_real_ttc (BRS 5%)
      let calculatedAmountRealTTC: number;
      if (parsedHasBrs) {
        calculatedAmountRealTTC = Math.round((parsedAmountDisplayTTC / 0.95) * 100) / 100;
      } else {
        calculatedAmountRealTTC = parsedAmountDisplayTTC;
      }

      console.log("Server-side calculations:", {
        amountDisplayTTC: parsedAmountDisplayTTC,
        vatApplicable: parsedVatApplicable,
        calculatedAmountHT,
        hasBrs: parsedHasBrs,
        calculatedAmountRealTTC
      });

      // ==================== TOKEN VALIDATION ====================
      const userToken = await storage.getUserTokenByToken(req.body.token || "");
      if (!userToken) {
        return res.status(401).json({ message: "Invalid or missing token" });
      }

      if (userToken.name !== userName) {
        return res.status(403).json({ message: "Token does not match user name" });
      }

      const driveFolderId = userToken.driveFolderId;

      // Generate file name with new format: YYMMDD_Supplier_AmountTTC
      const fileName = generateFileName(
        invoiceDate,
        supplier.name,
        amountDisplayTTC,
        file.originalname
      );

      // Upload file to Google Drive
      const driveFileId = await uploadFileToDrive(file, driveFolderId, fileName);

      // Determine category name for legacy field
      const categoryName = categoryData?.appName || category || "Non définie";

      // Create invoice with all fields
      const invoice = await storage.createInvoice({
        userName,
        invoiceDate: new Date(invoiceDate),
        supplierId,
        category: categoryName, // Legacy field
        amountDisplayTTC: parsedAmountDisplayTTC.toString(),
        vatApplicable: parsedVatApplicable,
        amountHT: calculatedAmountHT?.toString() || null,
        description: description || "",
        paymentType,
        projectId: projectId || null,
        fileName,
        filePath: driveFileId,
        driveFileId,
        // New fields
        isStockPurchase: parsedIsStockPurchase,
        categoryId: parsedCategoryId,
        hasBrs: parsedHasBrs,
        invoiceType: invoiceType || null,
        invoiceNumber: finalInvoiceNumber || null,
        amountRealTTC: calculatedAmountRealTTC.toString(),
      });

      // Send confirmation email
      const userEmail = userToken?.email || 
        (userName === "Michael" ? "michael@filtreplante.com" : 
         userName === "Marine" ? "marine@filtreplante.com" : 
         "fatou@filtreplante.com");

      let projectName: string | null = null;
      if (projectId) {
        const project = await storage.getProjectById(projectId);
        projectName = project ? `${project.number} - ${project.name}` : null;
      }

      const driveFileUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

      try {
        await sendInvoiceConfirmation(userEmail, userName, userToken.token, {
          supplierName: supplier?.name || "N/A",
          amount: parsedAmountDisplayTTC.toLocaleString("fr-FR"),
          date: format(new Date(invoiceDate), "d MMMM yyyy", { locale: fr }),
          category: categoryName,
          description: description || null,
          paymentType,
          projectName,
          driveFileUrl,
        });
      } catch (emailError) {
        console.error("Error sending email:", emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get invoice by ID (singular to avoid conflict with /api/invoices/:userName)
  app.get("/api/invoice/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoiceById(id);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update invoice
  app.put("/api/invoices/:id", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const file = req.file;

      // Get existing invoice
      const existingInvoice = await storage.getInvoiceById(id);
      if (!existingInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Verify ownership via token
      const token = req.body.token || "";
      const userToken = await storage.getUserTokenByToken(token);
      if (!userToken || userToken.name !== existingInvoice.userName) {
        return res.status(403).json({ message: "Unauthorized - You can only edit your own invoices" });
      }

      const {
        invoiceDate,
        supplierId,
        category,
        amountDisplayTTC,
        vatApplicable,
        amountHT,
        description,
        paymentType,
        projectId,
      } = req.body;

      // Prepare update data
      const updateData: any = {};
      
      if (invoiceDate) updateData.invoiceDate = new Date(invoiceDate);
      if (supplierId) updateData.supplierId = supplierId;
      if (category) updateData.category = category;
      if (amountDisplayTTC) updateData.amountDisplayTTC = amountDisplayTTC.toString();
      if (vatApplicable !== undefined) updateData.vatApplicable = vatApplicable === "true";
      if (amountHT !== undefined) updateData.amountHT = amountHT ? amountHT.toString() : null;
      if (description !== undefined) updateData.description = description || null;
      if (paymentType) updateData.paymentType = paymentType;
      if (projectId !== undefined) updateData.projectId = projectId || null;

      // Handle file replacement
      if (file) {
        // Get supplier name for file naming
        const finalSupplierId = supplierId || existingInvoice.supplierId;
        const supplier = await storage.getSupplierById(finalSupplierId);
        if (!supplier) {
          return res.status(400).json({ message: "Supplier not found" });
        }

        // Generate file name with new format: YYMMDD_Supplier_AmountTTC
        const finalInvoiceDate = invoiceDate || existingInvoice.invoiceDate.toISOString().split('T')[0];
        const finalAmountDisplayTTC = amountDisplayTTC || existingInvoice.amountDisplayTTC;
        const fileName = generateFileName(
          finalInvoiceDate,
          supplier.name,
          finalAmountDisplayTTC,
          file.originalname
        );

        // Upload new file to Google Drive
        const driveFileId = await uploadFileToDrive(file, userToken.driveFolderId, fileName);

        // Delete old file from Drive
        try {
          await deleteFileFromDrive(existingInvoice.driveFileId);
        } catch (driveError) {
          console.error("Error deleting old file from Drive:", driveError);
          // Continue even if old file deletion fails
        }

        // Update file references
        updateData.fileName = fileName;
        updateData.filePath = driveFileId;
        updateData.driveFileId = driveFileId;
      }

      // Update invoice in database
      const updatedInvoice = await storage.updateInvoice(id, updateData);

      if (!updatedInvoice) {
        return res.status(404).json({ message: "Invoice not found after update" });
      }

      res.json(updatedInvoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Download invoice file
  app.get("/api/invoices/:id/download", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoiceById(id);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const fileBuffer = await downloadFileFromDrive(invoice.driveFileId);

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${invoice.fileName}"`);
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete invoice
  app.delete("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoiceById(id);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Delete from Google Drive
      try {
        await deleteFileFromDrive(invoice.driveFileId);
      } catch (driveError) {
        console.error("Error deleting from Drive:", driveError);
        // Continue even if Drive deletion fails
      }

      // Delete from database
      await storage.deleteInvoice(id);

      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin sessions (in-memory for simplicity)
  const adminSessions = new Set<string>();

  // Admin login
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      const adminConfig = await storage.getAdminConfig();
      if (!adminConfig) {
        return res.status(500).json({ message: "Admin config not found" });
      }

      const isValid = await bcrypt.compare(password, adminConfig.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid password" });
      }

      // Generate session token
      const sessionToken = randomBytes(32).toString("hex");
      adminSessions.add(sessionToken);

      res.json({ message: "Login successful", sessionToken });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Middleware to verify admin authentication
  const verifyAdminAuth = (req: Request, res: Response, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token || !adminSessions.has(token)) {
      return res.status(401).json({ message: "Unauthorized - Invalid or missing admin session" });
    }

    next();
  };

  // Admin export CSV (protected) - includes archived invoices
  app.get("/api/admin/export-csv", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getAllInvoicesIncludingArchived();

      const csvHeader = "Nom,Date,Fournisseur,Catégorie,Montant TTC,TVA Applicable,Montant HT,Description,Type de règlement,Projet,Créé le\n";
      const csvRows = invoices.map((inv) => {
        const projectInfo = inv.projectNumber && inv.projectName 
          ? `${inv.projectNumber} - ${inv.projectName}` 
          : "";
        return [
          inv.userName,
          format(new Date(inv.invoiceDate), "dd/MM/yyyy"),
          inv.supplierName,
          inv.category,
          inv.amountDisplayTTC,
          inv.vatApplicable ? "Oui" : "Non",
          inv.amountHT || "",
          inv.description || "",
          inv.paymentType,
          projectInfo,
          format(new Date(inv.createdAt), "dd/MM/yyyy HH:mm"),
        ]
          .map((field) => `"${field}"`)
          .join(",");
      });

      const csv = csvHeader + csvRows.join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="factures_${format(new Date(), "yyyy-MM-dd")}.csv"`);
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Helper function to map internal categories to Axonaut categories
  function categoryToAxonaut(category: string): string {
    const mapping: Record<string, string> = {
      "Essence": "Fournitures non stockables – Autres énergies",
      "Restauration": "Réceptions", // Support legacy value
      "Restauration, boissons et petits achats alimentaires": "Réceptions",
      "Fourniture Matériaux": "Achats de matières premières et fournitures liées",
      "Achats Prestas": "Achats d'études et prestations de services (sous-traitance directe projets)",
      "Transport de matériel": "Transports sur achats",
      "Transport de personnes": "Voyages Et Deplacements",
      "Hébergement": "Voyages Et Deplacements",
      "Telephone/Internet": "Frais de télécommunications",
    };
    return mapping[category] || "";
  }

  // Admin export Axonaut CSV - Michael (protected)
  app.get("/api/admin/export-axonaut-michael", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getInvoicesByUser("Michael");

      // Headers exactly as in the template
      const csvHeader = "Date *;Titre *;Nom du fournisseur *;Code tiers fournisseur;Adresse - Rue du fournisseur;Adresse - Code postal;Adresse - Ville;Montant HT *;Montant TTC *;Montant TVA 20% *;Montant TVA 10% *;MontantTVA 5.5% *;Montant TTC du *;Categorie depense;Montant taxe 8.5%;Montant taxe 2.1%;Montant taxe22%;Montant taxe 11%;Montant taxe 6%;Montant taxe 3%;Montant taxe 12%;Montant taxe 21%;Montant taxe 18%; Numéro projet\n";
      
      const csvRows = invoices.map((inv) => {
        const invoiceDate = format(new Date(inv.invoiceDate), "dd/MM/yyyy");
        
        // Titre: description ou "Facture [fournisseur]"
        const titre = inv.description || `Facture ${inv.supplierName}`;
        
        // Montant HT: si TVA=Oui → amountHT, sinon → amountDisplayTTC
        const montantHT = inv.vatApplicable ? (inv.amountHT || inv.amountDisplayTTC) : inv.amountDisplayTTC;
        
        // Montant taxe 18%: si TVA=Oui → TTC - HT, sinon → 0
        const montantTaxe18 = inv.vatApplicable && inv.amountHT 
          ? (parseFloat(inv.amountDisplayTTC) - parseFloat(inv.amountHT)).toFixed(2)
          : "0";
        
        // Numéro projet: extraire uniquement le numéro (2025-34 → 34)
        let numeroProjet = "";
        if (inv.projectNumber) {
          const match = inv.projectNumber.match(/\d+$/); // Extraire les chiffres à la fin
          numeroProjet = match ? match[0] : "";
        }

        return [
          invoiceDate,                    // Date *
          titre,                          // Titre *
          inv.supplierName,               // Nom du fournisseur *
          "",                             // Code tiers fournisseur
          "",                             // Adresse - Rue du fournisseur
          "",                             // Adresse - Code postal
          "",                             // Adresse - Ville
          montantHT,                      // Montant HT *
          inv.amountDisplayTTC,                  // Montant TTC *
          "0",                            // Montant TVA 20% *
          "0",                            // Montant TVA 10% *
          "0",                            // MontantTVA 5.5% *
          invoiceDate,                    // Montant TTC du * (même date)
          categoryToAxonaut(inv.category), // Categorie depense
          "",                             // Montant taxe 8.5%
          "",                             // Montant taxe 2.1%
          "",                             // Montant taxe22%
          "",                             // Montant taxe 11%
          "",                             // Montant taxe 6%
          "",                             // Montant taxe 3%
          "",                             // Montant taxe 12%
          "",                             // Montant taxe 21%
          montantTaxe18,                  // Montant taxe 18%
          numeroProjet,                   // Numéro projet
        ]
          .map((field) => `"${field}"`)
          .join(";");
      });

      const csv = csvHeader + csvRows.join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="axonaut_michael_${format(new Date(), "yyyy-MM-dd")}.csv"`);
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting Axonaut CSV Michael:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin export Axonaut CSV - Marine (protected)
  app.get("/api/admin/export-axonaut-marine", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getInvoicesByUser("Marine");

      // Headers exactly as in the template
      const csvHeader = "Date *;Titre *;Nom du fournisseur *;Code tiers fournisseur;Adresse - Rue du fournisseur;Adresse - Code postal;Adresse - Ville;Montant HT *;Montant TTC *;Montant TVA 20% *;Montant TVA 10% *;MontantTVA 5.5% *;Montant TTC du *;Categorie depense;Montant taxe 8.5%;Montant taxe 2.1%;Montant taxe22%;Montant taxe 11%;Montant taxe 6%;Montant taxe 3%;Montant taxe 12%;Montant taxe 21%;Montant taxe 18%; Numéro projet\n";
      
      const csvRows = invoices.map((inv) => {
        const invoiceDate = format(new Date(inv.invoiceDate), "dd/MM/yyyy");
        
        // Titre: description ou "Facture [fournisseur]"
        const titre = inv.description || `Facture ${inv.supplierName}`;
        
        // Montant HT: si TVA=Oui → amountHT, sinon → amountDisplayTTC
        const montantHT = inv.vatApplicable ? (inv.amountHT || inv.amountDisplayTTC) : inv.amountDisplayTTC;
        
        // Montant taxe 18%: si TVA=Oui → TTC - HT, sinon → 0
        const montantTaxe18 = inv.vatApplicable && inv.amountHT 
          ? (parseFloat(inv.amountDisplayTTC) - parseFloat(inv.amountHT)).toFixed(2)
          : "0";
        
        // Numéro projet: extraire uniquement le numéro (2025-34 → 34)
        let numeroProjet = "";
        if (inv.projectNumber) {
          const match = inv.projectNumber.match(/\d+$/); // Extraire les chiffres à la fin
          numeroProjet = match ? match[0] : "";
        }

        return [
          invoiceDate,                    // Date *
          titre,                          // Titre *
          inv.supplierName,               // Nom du fournisseur *
          "",                             // Code tiers fournisseur
          "",                             // Adresse - Rue du fournisseur
          "",                             // Adresse - Code postal
          "",                             // Adresse - Ville
          montantHT,                      // Montant HT *
          inv.amountDisplayTTC,                  // Montant TTC *
          "0",                            // Montant TVA 20% *
          "0",                            // Montant TVA 10% *
          "0",                            // MontantTVA 5.5% *
          invoiceDate,                    // Montant TTC du * (même date)
          categoryToAxonaut(inv.category), // Categorie depense
          "",                             // Montant taxe 8.5%
          "",                             // Montant taxe 2.1%
          "",                             // Montant taxe22%
          "",                             // Montant taxe 11%
          "",                             // Montant taxe 6%
          "",                             // Montant taxe 3%
          "",                             // Montant taxe 12%
          "",                             // Montant taxe 21%
          montantTaxe18,                  // Montant taxe 18%
          numeroProjet,                   // Numéro projet
        ]
          .map((field) => `"${field}"`)
          .join(";");
      });

      const csv = csvHeader + csvRows.join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="axonaut_marine_${format(new Date(), "yyyy-MM-dd")}.csv"`);
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting Axonaut CSV Marine:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin export Axonaut CSV - Fatou (protected)
  app.get("/api/admin/export-axonaut-fatou", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getInvoicesByUser("Fatou");

      // Headers exactly as in the template
      const csvHeader = "Date *;Titre *;Nom du fournisseur *;Code tiers fournisseur;Adresse - Rue du fournisseur;Adresse - Code postal;Adresse - Ville;Montant HT *;Montant TTC *;Montant TVA 20% *;Montant TVA 10% *;MontantTVA 5.5% *;Montant TTC du *;Categorie depense;Montant taxe 8.5%;Montant taxe 2.1%;Montant taxe22%;Montant taxe 11%;Montant taxe 6%;Montant taxe 3%;Montant taxe 12%;Montant taxe 21%;Montant taxe 18%; Numéro projet\n";
      
      const csvRows = invoices.map((inv) => {
        const invoiceDate = format(new Date(inv.invoiceDate), "dd/MM/yyyy");
        
        // Titre: description ou "Facture [fournisseur]"
        const titre = inv.description || `Facture ${inv.supplierName}`;
        
        // Montant HT: si TVA=Oui → amountHT, sinon → amountDisplayTTC
        const montantHT = inv.vatApplicable ? (inv.amountHT || inv.amountDisplayTTC) : inv.amountDisplayTTC;
        
        // Montant taxe 18%: si TVA=Oui → TTC - HT, sinon → 0
        const montantTaxe18 = inv.vatApplicable && inv.amountHT 
          ? (parseFloat(inv.amountDisplayTTC) - parseFloat(inv.amountHT)).toFixed(2)
          : "0";
        
        // Numéro projet: extraire uniquement le numéro (2025-34 → 34)
        let numeroProjet = "";
        if (inv.projectNumber) {
          const match = inv.projectNumber.match(/\d+$/); // Extraire les chiffres à la fin
          numeroProjet = match ? match[0] : "";
        }

        return [
          invoiceDate,                    // Date *
          titre,                          // Titre *
          inv.supplierName,               // Nom du fournisseur *
          "",                             // Code tiers fournisseur
          "",                             // Adresse - Rue du fournisseur
          "",                             // Adresse - Code postal
          "",                             // Adresse - Ville
          montantHT,                      // Montant HT *
          inv.amountDisplayTTC,                  // Montant TTC *
          "0",                            // Montant TVA 20% *
          "0",                            // Montant TVA 10% *
          "0",                            // MontantTVA 5.5% *
          invoiceDate,                    // Montant TTC du * (même date)
          categoryToAxonaut(inv.category), // Categorie depense
          "",                             // Montant taxe 8.5%
          "",                             // Montant taxe 2.1%
          "",                             // Montant taxe22%
          "",                             // Montant taxe 11%
          "",                             // Montant taxe 6%
          "",                             // Montant taxe 3%
          "",                             // Montant taxe 12%
          "",                             // Montant taxe 21%
          montantTaxe18,                  // Montant taxe 18%
          numeroProjet,                   // Numéro projet
        ]
          .map((field) => `"${field}"`)
          .join(";");
      });

      const csv = csvHeader + csvRows.join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="axonaut_fatou_${format(new Date(), "yyyy-MM-dd")}.csv"`);
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting Axonaut CSV Fatou:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin reset database (protected)
  app.post("/api/admin/reset-database", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      // Get all users
      const users = await storage.getAllUserTokens();

      // Archive files for each user in Google Drive instead of deleting
      // If archiving fails for any user, abort the reset to prevent data loss
      let totalArchived = 0;
      const archiveErrors: string[] = [];
      
      for (const user of users) {
        try {
          const archivedCount = await archiveUserFiles(user.driveFolderId);
          totalArchived += archivedCount;
          console.log(`Archived ${archivedCount} files for user ${user.name}`);
        } catch (driveError) {
          console.error(`Error archiving files for user ${user.name}:`, driveError);
          archiveErrors.push(`${user.name}: ${driveError instanceof Error ? driveError.message : 'Unknown error'}`);
        }
      }

      // If any archiving failed, abort without updating database records
      if (archiveErrors.length > 0) {
        return res.status(500).json({ 
          message: "Failed to archive files in Google Drive. Invoices were not archived to prevent data loss.",
          errors: archiveErrors
        });
      }

      // Only update archive field if all files were successfully archived
      // Format: YYMMDD (e.g., "251101" for Nov 1, 2025)
      const archiveDate = format(new Date(), "yyMMdd");
      
      const result = await db
        .update(invoices)
        .set({ archive: archiveDate })
        .where(isNull(invoices.archive))
        .returning();

      res.json({ 
        message: "Invoices archived successfully", 
        archivedFiles: totalArchived,
        archivedInvoices: result.length
      });
    } catch (error) {
      console.error("Error resetting database:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
