import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { storage, generateExpenseNumber } from "./storage";
import { db } from "./db";
import { uploadFileToDrive, deleteFileFromDrive, downloadFileFromDrive, archiveUserFiles } from "./integrations/google-drive";
import { sendInvoiceConfirmation } from "./integrations/resend";
import { insertInvoiceSchema, insertSupplierSchema, invoices, InvoiceWithDetails } from "@shared/schema";
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

  // Get invoices for a user with optional filters
  app.get("/api/invoices/:userName", async (req: Request, res: Response) => {
    try {
      const { userName } = req.params;
      const { type, category_id, has_brs, is_stock_purchase, sort_by, sort_order } = req.query;

      const filters: {
        type?: 'expense' | 'supplier_invoice' | 'all';
        categoryId?: number | 'all';
        hasBrs?: boolean;
        isStockPurchase?: boolean;
        sortBy?: 'date' | 'supplier' | 'amount';
        sortOrder?: 'asc' | 'desc';
      } = {};

      if (type && ['expense', 'supplier_invoice', 'all'].includes(type as string)) {
        filters.type = type as 'expense' | 'supplier_invoice' | 'all';
      }

      if (category_id) {
        if (category_id === 'all') {
          filters.categoryId = 'all';
        } else {
          const catId = parseInt(category_id as string);
          if (!isNaN(catId)) {
            filters.categoryId = catId;
          }
        }
      }

      if (has_brs === 'true') {
        filters.hasBrs = true;
      }

      if (is_stock_purchase === 'true') {
        filters.isStockPurchase = true;
      }

      if (sort_by && ['date', 'supplier', 'amount'].includes(sort_by as string)) {
        filters.sortBy = sort_by as 'date' | 'supplier' | 'amount';
      }

      if (sort_order && ['asc', 'desc'].includes(sort_order as string)) {
        filters.sortOrder = sort_order as 'asc' | 'desc';
      }

      const hasFilters = Object.keys(filters).length > 0;
      const invoices = hasFilters 
        ? await storage.getInvoicesByUserWithFilters(userName, filters)
        : await storage.getInvoicesByUser(userName);
      
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

      // ==================== VALIDATION 2: Invoice number generation/validation ====================
      let finalInvoiceNumber: string | null = null;
      
      if (invoiceType === 'supplier_invoice') {
        // Supplier invoice: user must provide invoice number
        if (!invoiceNumber || invoiceNumber.trim() === '') {
          return res.status(400).json({ message: "Numéro de facture obligatoire pour les Factures Fournisseur" });
        }
        finalInvoiceNumber = invoiceNumber.trim();
      } else if (invoiceType === 'expense') {
        // Expense: auto-generate DEP-UU-YYMM-XXX number
        const parsedInvoiceDate = new Date(invoiceDate);
        finalInvoiceNumber = await generateExpenseNumber(userName, parsedInvoiceDate);
        console.log("Generated expense number:", finalInvoiceNumber);
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

      // ==================== VALIDATION 4: BRS only for specific categories + TVA=Non ====================
      if (parsedHasBrs) {
        const brsCategoryNames = [
          "Achats d'études et prestations de services",
          "Transports sur ventes",
          "Autres entretiens et réparations"
        ];
        
        if (parsedVatApplicable) {
          return res.status(400).json({ 
            message: "BRS applicable uniquement pour Prestation de services, Transports ou Frais de maintenance sans TVA" 
          });
        }
        if (categoryData && !brsCategoryNames.includes(categoryData.accountName)) {
          return res.status(400).json({ 
            message: "BRS applicable uniquement pour Prestation de services, Transports ou Frais de maintenance sans TVA" 
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

      // ==================== TVA FORCING RULES ====================
      // Force TVA to false for Restaurant (Réceptions) and Essence categories
      let finalVatApplicable = parsedVatApplicable;
      if (categoryData) {
        const mustForceNoVat = 
          categoryData.accountName === 'Réceptions' ||
          categoryData.accountName === 'Fournitures non stockables - Energies';
        
        if (mustForceNoVat) {
          finalVatApplicable = false;
        }
      }

      // ==================== SERVER-SIDE CALCULATIONS ====================
      // Calculate amount_ht (TVA 18%)
      let calculatedAmountHT: number | null = null;
      if (finalVatApplicable) {
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
        vatApplicable: finalVatApplicable,
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
        vatApplicable: finalVatApplicable,
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

  // Update invoice with full Phase 2 validation
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
        amountDisplayTTC,
        isStockPurchase,
        categoryId,
        vatApplicable,
        hasBrs,
        invoiceType,
        invoiceNumber,
        description,
        paymentType,
        projectId,
      } = req.body;

      // Parse values
      const parsedAmountDisplayTTC = parseFloat(amountDisplayTTC) || 0;
      const parsedCategoryId = categoryId ? parseInt(categoryId) : null;
      const parsedVatApplicable = vatApplicable === "true" || vatApplicable === true;
      const parsedHasBrs = hasBrs === "true" || hasBrs === true;
      const parsedIsStockPurchase = isStockPurchase === "true" || isStockPurchase === true;

      // Get category data for validations
      let categoryData = null;
      let categoryName = "";
      if (parsedCategoryId) {
        categoryData = await storage.getCategoryById(parsedCategoryId);
        if (!categoryData) {
          return res.status(400).json({ message: "Catégorie invalide" });
        }
        categoryName = categoryData.appName;
      }

      // Get supplier for validation
      const finalSupplierId = supplierId || existingInvoice.supplierId;
      const supplier = await storage.getSupplierById(finalSupplierId);

      // ==================== VALIDATIONS (same as POST) ====================

      // VALIDATION 1: Stock purchase must use stock category
      if (parsedIsStockPurchase) {
        if (categoryData && categoryData.accountCode !== "3210000000") {
          return res.status(400).json({ 
            message: "Les achats pour le stock doivent utiliser la catégorie Stock" 
          });
        }
      }

      // VALIDATION 2: Restaurant/Essence categories force TVA=false
      if (categoryData) {
        const accountName = categoryData.accountName;
        if (
          (accountName === "Réceptions" || accountName === "Fournitures non stockables - Energies") &&
          parsedVatApplicable
        ) {
          return res.status(400).json({ 
            message: "La TVA n'est pas applicable pour les catégories Restaurant ou Essence" 
          });
        }
      }

      // VALIDATION 3: BRS only for specific categories + TVA=Non
      if (parsedHasBrs) {
        const brsCategoryNames = [
          "Achats d'études et prestations de services",
          "Transports sur ventes",
          "Autres entretiens et réparations"
        ];
        
        if (parsedVatApplicable) {
          return res.status(400).json({ 
            message: "BRS applicable uniquement pour Prestation de services, Transports ou Frais de maintenance sans TVA" 
          });
        }
        if (categoryData && !brsCategoryNames.includes(categoryData.accountName)) {
          return res.status(400).json({ 
            message: "BRS applicable uniquement pour Prestation de services, Transports ou Frais de maintenance sans TVA" 
          });
        }
      }

      // VALIDATION 4: Invoice type forcing rules
      if (invoiceType && categoryData) {
        const mustBeSupplierInvoice = 
          parsedAmountDisplayTTC >= 500000 || 
          supplier?.isRegularSupplier === true || 
          parsedHasBrs;

        if (mustBeSupplierInvoice && invoiceType !== "supplier_invoice") {
          return res.status(400).json({ 
            message: "Ce montant/fournisseur/BRS nécessite une Facture Fournisseur" 
          });
        }

        const accountName = categoryData.accountName;
        const mustBeExpense = 
          accountName === "Réceptions" || 
          accountName === "Fournitures non stockables - Energies";

        if (mustBeExpense && invoiceType !== "expense") {
          return res.status(400).json({ 
            message: "Les catégories Restaurant/Essence doivent être des Dépenses" 
          });
        }
      }

      // ==================== INVOICE NUMBER MANAGEMENT ====================
      // Determine original type and current type for change detection
      const originalType = existingInvoice.invoiceType || 'expense';
      const newType = invoiceType || originalType;
      
      let finalInvoiceNumber: string | null = null;
      
      // CASE 1: No type change
      if (originalType === newType) {
        if (newType === 'expense') {
          // Expense stays expense: keep original number (frozen)
          finalInvoiceNumber = existingInvoice.invoiceNumber;
        } else {
          // Supplier invoice stays supplier invoice: use provided number (modifiable)
          if (!invoiceNumber || invoiceNumber.trim() === '') {
            return res.status(400).json({ 
              message: "Le numéro de facture est requis pour les Factures Fournisseur" 
            });
          }
          finalInvoiceNumber = invoiceNumber.trim();
        }
      }
      // CASE 2: Type change
      else {
        if (originalType === 'expense' && newType === 'supplier_invoice') {
          // Expense → Supplier invoice: require new manual number
          if (!invoiceNumber || invoiceNumber.trim() === '') {
            return res.status(400).json({ 
              message: "Numéro de facture obligatoire lors du changement vers Facture Fournisseur" 
            });
          }
          finalInvoiceNumber = invoiceNumber.trim();
        } else if (originalType === 'supplier_invoice' && newType === 'expense') {
          // Supplier invoice → Expense: generate new DEP number
          const finalDate = invoiceDate ? new Date(invoiceDate) : existingInvoice.invoiceDate;
          finalInvoiceNumber = await generateExpenseNumber(existingInvoice.userName, finalDate);
          console.log("Generated expense number on type change:", finalInvoiceNumber);
        }
      }

      // Calculate amounts
      let calculatedAmountHT = null;
      let calculatedAmountRealTTC = parsedAmountDisplayTTC.toString();

      if (parsedVatApplicable && parsedAmountDisplayTTC > 0) {
        calculatedAmountHT = (parsedAmountDisplayTTC / 1.18).toString();
      }

      if (parsedHasBrs && parsedAmountDisplayTTC > 0) {
        calculatedAmountRealTTC = (parsedAmountDisplayTTC / 0.95).toString();
      }

      // Prepare update data
      const updateData: any = {
        invoiceDate: invoiceDate ? new Date(invoiceDate) : existingInvoice.invoiceDate,
        supplierId: finalSupplierId,
        amountDisplayTTC: parsedAmountDisplayTTC.toString(),
        isStockPurchase: parsedIsStockPurchase,
        categoryId: parsedCategoryId,
        category: categoryName,
        vatApplicable: parsedVatApplicable,
        amountHT: calculatedAmountHT,
        hasBrs: parsedHasBrs,
        amountRealTTC: calculatedAmountRealTTC,
        invoiceType: newType,
        invoiceNumber: finalInvoiceNumber,
        description: description || null,
        paymentType: paymentType || existingInvoice.paymentType,
        projectId: projectId || null,
      };

      // Handle file replacement
      if (file) {
        if (!supplier) {
          return res.status(400).json({ message: "Supplier not found" });
        }

        const finalInvoiceDate = invoiceDate || existingInvoice.invoiceDate.toISOString().split('T')[0];
        const fileName = generateFileName(
          finalInvoiceDate,
          supplier.name,
          parsedAmountDisplayTTC.toString(),
          file.originalname
        );

        const driveFileId = await uploadFileToDrive(file, userToken.driveFolderId, fileName);

        try {
          await deleteFileFromDrive(existingInvoice.driveFileId);
        } catch (driveError) {
          console.error("Error deleting old file from Drive:", driveError);
        }

        updateData.fileName = fileName;
        updateData.filePath = driveFileId;
        updateData.driveFileId = driveFileId;
      }

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

  // Helper function to generate Axonaut CSV for a user
  function generateAxonautCSV(invoices: InvoiceWithDetails[]): string {
    // Headers exactly as in the Axonaut template (24 columns)
    const csvHeader = "Date *;Titre *;Nom du fournisseur *;Code tiers fournisseur;Adresse - Rue du fournisseur;Adresse - Code postal;Adresse - Ville;Montant HT *;Montant TTC *;Montant TVA 20% *;Montant TVA 10% *;MontantTVA 5.5% *;Montant TTC du *;Categorie depense;Montant taxe 8.5%;Montant taxe 2.1%;Montant taxe22%;Montant taxe 11%;Montant taxe 6%;Montant taxe 3%;Montant taxe 12%;Montant taxe 21%;Montant taxe 18%;Numéro projet\n";
    
    const csvRows = invoices.map((inv) => {
      const invoiceDate = format(new Date(inv.invoiceDate), "dd/MM/yyyy");
      
      // Titre: description ou "Facture [fournisseur]"
      const titre = inv.description || `Facture ${inv.supplierName}`;
      
      // Montant TTC (always use amount_display_ttc, not amount_real_ttc)
      const ttc = parseFloat(inv.amountDisplayTTC);
      
      // Montant HT: si TVA=Oui → TTC / 1.18, sinon → TTC (HT = TTC car pas de TVA)
      const montantHT = inv.vatApplicable 
        ? (ttc / 1.18).toFixed(2)
        : ttc.toFixed(2);
      
      // Montant taxe 18%: si TVA=Oui → TTC - HT, sinon → 0
      const montantTaxe18 = inv.vatApplicable 
        ? (ttc - (ttc / 1.18)).toFixed(2)
        : "0";
      
      // Numéro projet: extraire uniquement le numéro (2025-34 → 34)
      let numeroProjet = "";
      if (inv.projectNumber) {
        const match = inv.projectNumber.match(/\d+$/);
        numeroProjet = match ? match[0] : "";
      }
      
      // Categorie: use categoryAccountName from LEFT JOIN categories (Zoho account names)
      const categorie = inv.categoryAccountName || "";

      return [
        invoiceDate,                    // Date *
        titre,                          // Titre *
        inv.supplierName,               // Nom du fournisseur *
        "",                             // Code tiers fournisseur
        "",                             // Adresse - Rue du fournisseur
        "",                             // Adresse - Code postal
        "",                             // Adresse - Ville
        montantHT,                      // Montant HT *
        ttc.toFixed(2),                 // Montant TTC *
        "0",                            // Montant TVA 20% *
        "0",                            // Montant TVA 10% *
        "0",                            // MontantTVA 5.5% *
        invoiceDate,                    // Montant TTC du * (même date)
        categorie,                      // Categorie depense (from categories.account_name)
        "0",                            // Montant taxe 8.5%
        "0",                            // Montant taxe 2.1%
        "0",                            // Montant taxe22%
        "0",                            // Montant taxe 11%
        "0",                            // Montant taxe 6%
        "0",                            // Montant taxe 3%
        "0",                            // Montant taxe 12%
        "0",                            // Montant taxe 21%
        montantTaxe18,                  // Montant taxe 18%
        numeroProjet,                   // Numéro projet
      ]
        .map((field) => `"${field}"`)
        .join(";");
    });

    return csvHeader + csvRows.join("\n");
  }

  // Admin export Axonaut CSV - Michael (protected)
  app.get("/api/admin/export-axonaut-michael", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getInvoicesByUser("Michael");
      const csv = generateAxonautCSV(invoices);

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
      const csv = generateAxonautCSV(invoices);

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
      const csv = generateAxonautCSV(invoices);

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
