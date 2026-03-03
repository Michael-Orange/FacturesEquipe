import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { storage, generateExpenseNumber } from "./storage";
import { db } from "./db";
import { uploadFileToDrive, deleteFileFromDrive, downloadFileFromDrive, archiveUserFiles, getOrCreateSubfolder } from "./integrations/google-drive";
import { sendInvoiceConfirmation, sendPaymentConfirmation } from "./integrations/resend";
import { insertInvoiceSchema, insertSupplierSchema, insertPaymentSchema, invoices, payments, InvoiceWithDetails, InvoiceWithPayments, paymentMethodsMapping, categories, suppliers, projects } from "@shared/schema";
import { isNull, eq, and, gte, lte, desc, asc, count, sql } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { generateFileName } from "./utils";

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Convertit une chaîne en Title Case (première lettre de chaque mot en majuscule)
 * Ex: "CAFE LULU" → "Cafe Lulu"
 */
function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

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

      // CSV header with payment columns
      const csvHeader = "Date;Fournisseur;Catégorie;Montant TTC;TVA;Montant HT;Description;Mode de paiement;Projet;Type;N° Facture;Statut Paiement;Total Payé;Reste à Payer\n";
      
      const csvRows = await Promise.all(invoices.map(async (inv) => {
        const invoiceDate = format(new Date(inv.invoiceDate), "dd/MM/yyyy", { locale: fr });
        const tva = inv.vatApplicable ? "Oui" : "Non";
        const montantHT = inv.amountHT || "";
        const description = inv.description || "";
        const projet = inv.projectNumber ? `${inv.projectNumber} - ${inv.projectName}` : "";
        const typeFacture = inv.invoiceType === 'supplier_invoice' ? 'Facture Fournisseur' : 'Dépense';
        const numFacture = inv.invoiceNumber || "";
        
        let statutPaiement = "";
        let totalPaye = "";
        let resteAPayer = "";
        
        if (inv.invoiceType === 'supplier_invoice') {
          const payments = await storage.getPaymentsByInvoiceId(inv.id);
          const totalPaidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amountPaid?.toString() || "0"), 0);
          const amountToPay = parseFloat(inv.amountDisplayTTC?.toString() || "0");
          const remaining = amountToPay - totalPaidAmount;
          
          statutPaiement = inv.paymentStatus === 'paid' ? 'Payé' : inv.paymentStatus === 'partial' ? 'Partiel' : 'Non payé';
          totalPaye = totalPaidAmount.toString();
          resteAPayer = remaining.toString();
        }

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
          typeFacture,
          numFacture,
          statutPaiement,
          totalPaye,
          resteAPayer,
        ]
          .map((field) => `"${String(field)}"`)
          .join(";");
      }));

      const csv = csvHeader + csvRows.join("\n");

      res.setHeader("Cache-Control", "no-store, no-cache");
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
        // Payment fields for supplier invoices
        paymentFull,
        firstPaymentAmount,
        firstPaymentDate,
        firstPaymentType,
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

      // Get or create subfolder based on invoice type
      const subfolderName = invoiceType === 'expense' ? 'Dépenses' : 'Factures Fournisseurs';
      const targetFolderId = await getOrCreateSubfolder(driveFolderId, subfolderName);

      // Upload file to Google Drive subfolder
      const driveFileId = await uploadFileToDrive(file, targetFolderId, fileName);

      // Determine category name for legacy field
      const categoryName = categoryData?.appName || category || "Non définie";

      // ==================== PAYMENT HANDLING FOR SUPPLIER INVOICES ====================
      const isPaymentFull = paymentFull === "true" || paymentFull === true;
      const parsedFirstPaymentAmount = firstPaymentAmount ? parseFloat(firstPaymentAmount) : null;
      
      // Determine initial payment status
      let initialPaymentStatus: "unpaid" | "partial" | "paid" = "unpaid";
      if (invoiceType === 'supplier_invoice') {
        if (isPaymentFull) {
          initialPaymentStatus = "paid";
        } else if (parsedFirstPaymentAmount && parsedFirstPaymentAmount > 0) {
          if (parsedFirstPaymentAmount >= parsedAmountDisplayTTC) {
            initialPaymentStatus = "paid";
          } else {
            initialPaymentStatus = "partial";
          }
        }
      }

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
        paymentStatus: initialPaymentStatus,
      });

      // Create first payment for supplier invoices
      if (invoiceType === 'supplier_invoice' && invoice.id) {
        const paymentAmount = isPaymentFull 
          ? parsedAmountDisplayTTC 
          : (parsedFirstPaymentAmount || 0);
        
        const paymentDate = firstPaymentDate || invoiceDate;
        const pType = firstPaymentType || paymentType;

        if (paymentAmount > 0) {
          await storage.createPayment({
            invoiceId: invoice.id,
            amountPaid: paymentAmount.toString(),
            paymentDate: format(new Date(paymentDate), 'yyyy-MM-dd'),
            paymentType: pType,
            createdBy: userToken.id,
          });
          console.log(`[INFO] First payment created - Invoice: ${invoice.id} - Amount: ${paymentAmount} - Status: ${initialPaymentStatus}`);
        }
      }

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
        let paymentInfo = null;
        if (invoiceType === 'supplier_invoice') {
          const paymentAmount = isPaymentFull 
            ? parsedAmountDisplayTTC 
            : (parsedFirstPaymentAmount || 0);
          const paymentDate = firstPaymentDate || invoiceDate;
          const pType = firstPaymentType || paymentType;
          const remainingAmount = parsedAmountDisplayTTC - paymentAmount;
          
          if (paymentAmount > 0) {
            paymentInfo = {
              status: initialPaymentStatus,
              firstPaymentAmount: paymentAmount.toLocaleString("fr-FR"),
              firstPaymentDate: format(new Date(paymentDate), "d MMMM yyyy", { locale: fr }),
              firstPaymentType: pType,
              remainingAmount: remainingAmount > 0 ? remainingAmount.toLocaleString("fr-FR") : undefined,
            };
          }
        }

        await sendInvoiceConfirmation(userEmail, userName, userToken.token, {
          supplierName: supplier?.name || "N/A",
          amount: parsedAmountDisplayTTC.toLocaleString("fr-FR"),
          date: format(new Date(invoiceDate), "d MMMM yyyy", { locale: fr }),
          category: categoryName,
          description: description || null,
          paymentType,
          projectName,
          driveFileUrl,
          invoiceType: invoiceType || undefined,
          invoiceNumber: finalInvoiceNumber || null,
          paymentInfo,
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

        // Get or create subfolder based on invoice type
        const subfolderName = newType === 'expense' ? 'Dépenses' : 'Factures Fournisseurs';
        const targetFolderId = await getOrCreateSubfolder(userToken.driveFolderId, subfolderName);

        const driveFileId = await uploadFileToDrive(file, targetFolderId, fileName);

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

  // Admin consolidated invoices view (protected) - for admin dashboard table
  app.get("/api/admin/invoices/consolidated", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const { user, type, date_start, date_end } = req.query;
      
      // Default: last 2 months
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      twoMonthsAgo.setHours(0, 0, 0, 0);
      
      const startDate = date_start ? new Date(String(date_start)) : twoMonthsAgo;
      const endDate = date_end ? new Date(String(date_end)) : new Date();
      endDate.setHours(23, 59, 59, 999);
      
      // Build WHERE conditions - exclude archived
      const conditions: any[] = [
        isNull(invoices.archive),
        gte(invoices.invoiceDate, startDate),
        lte(invoices.invoiceDate, endDate),
      ];
      
      // Filter by user if specified
      if (user && user !== "all") {
        const userName = String(user).charAt(0).toUpperCase() + String(user).slice(1).toLowerCase();
        conditions.push(eq(invoices.userName, userName));
      }
      
      // Filter by type if specified
      if (type && type !== "all") {
        conditions.push(eq(invoices.invoiceType, String(type)));
      }
      
      // Query with all necessary joins
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
          amountHT: invoices.amountHT,
          amountRealTTC: invoices.amountRealTTC,
          vatApplicable: invoices.vatApplicable,
          description: invoices.description,
          paymentType: invoices.paymentType,
          invoiceNumber: invoices.invoiceNumber,
          invoiceType: invoices.invoiceType,
          isStockPurchase: invoices.isStockPurchase,
          hasBrs: invoices.hasBrs,
          paymentStatus: invoices.paymentStatus,
          projectId: invoices.projectId,
          projectName: projects.name,
          projectNumber: projects.number,
          categoryId: invoices.categoryId,
          categoryAppName: categories.appName,
          categoryAccountName: categories.accountName,
          categoryAccountCode: categories.accountCode,
          fileName: invoices.fileName,
          driveFileId: invoices.driveFileId,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
        .leftJoin(projects, eq(invoices.projectId, projects.id))
        .leftJoin(categories, eq(invoices.categoryId, categories.id))
        .where(and(...conditions))
        .orderBy(desc(invoices.invoiceDate));
      
      // Fetch payments for supplier invoices
      const invoiceIds = result.map(inv => inv.id);
      let paymentsMap: Map<string, any[]> = new Map();
      
      if (invoiceIds.length > 0) {
        const allPayments = await db
          .select()
          .from(payments)
          .where(sql`${payments.invoiceId} = ANY(${sql.raw(`ARRAY[${invoiceIds.map(id => `'${id}'`).join(',')}]::varchar[]`)})`);
        
        allPayments.forEach((p) => {
          const existing = paymentsMap.get(p.invoiceId) || [];
          existing.push(p);
          paymentsMap.set(p.invoiceId, existing);
        });
      }
      
      // Enrich result with payment info
      const enrichedResult = result.map(inv => {
        const invPayments = paymentsMap.get(inv.id) || [];
        const totalPaid = invPayments.reduce((sum, p) => sum + parseFloat(p.amountPaid || "0"), 0);
        const invoiceAmount = parseFloat(inv.amountDisplayTTC || "0");
        const remainingAmount = Math.max(0, invoiceAmount - totalPaid);
        
        return {
          ...inv,
          payments: invPayments,
          totalPaid,
          remainingAmount,
        };
      });
      
      res.json(enrichedResult);
    } catch (error) {
      console.error("Error fetching consolidated invoices:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin export CSV (protected) - includes archived invoices
  app.get("/api/admin/export-csv", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const invoices = await storage.getAllInvoicesIncludingArchived();

      const csvHeader = "Nom,Date,Fournisseur,Catégorie,Montant TTC,TVA Applicable,Montant HT,Description,Type de règlement,Projet,Type Facture,N° Facture,Statut Paiement,Total Payé,Reste à Payer,Créé le\n";
      const csvRows = await Promise.all(invoices.map(async (inv) => {
        const projectInfo = inv.projectNumber && inv.projectName 
          ? `${inv.projectNumber} - ${inv.projectName}` 
          : "";
        
        const typeFacture = inv.invoiceType === 'supplier_invoice' ? 'Facture Fournisseur' : 'Dépense';
        const numFacture = inv.invoiceNumber || "";
        
        let statutPaiement = "";
        let totalPaye = "";
        let resteAPayer = "";
        
        if (inv.invoiceType === 'supplier_invoice') {
          const payments = await storage.getPaymentsByInvoiceId(inv.id);
          const totalPaidAmount = payments.reduce((sum, p) => sum + parseFloat(p.amountPaid?.toString() || "0"), 0);
          const amountToPay = parseFloat(inv.amountDisplayTTC?.toString() || "0");
          const remaining = amountToPay - totalPaidAmount;
          
          statutPaiement = inv.paymentStatus === 'paid' ? 'Payé' : inv.paymentStatus === 'partial' ? 'Partiel' : 'Non payé';
          totalPaye = totalPaidAmount.toString();
          resteAPayer = remaining.toString();
        }

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
          typeFacture,
          numFacture,
          statutPaiement,
          totalPaye,
          resteAPayer,
          format(new Date(inv.createdAt), "dd/MM/yyyy HH:mm"),
        ]
          .map((field) => `"${String(field)}"`)
          .join(",");
      }));

      const csv = csvHeader + csvRows.join("\n");

      res.setHeader("Cache-Control", "no-store, no-cache");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="factures_${format(new Date(), "yyyy-MM-dd")}.csv"`);
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================
  // ZOHO EXPORTS - Dépenses format Zoho Books
  // ============================================

  // Helper function to generate Zoho CSV for expenses
  function generateZohoExpenseCSV(expenseData: any[]): string {
    // Headers exactly as in Zoho Books import template (31 columns - added TDS_Name and TDS_Percentage)
    const csvHeader = "Entry Number,Expense Date,Expense Account,Expense Account Name,Paid Through,Vendor,Expense Description,Currency Code,Exchange Rate,Expense Amount,Tax Name,Tax Percentage,Is Inclusive Tax,Is Billable,Customer Name,Reference#,Mileage Rate,Distance,Start Odometer Reading,End Odometer Reading,Mileage Unit,Mileage Type,Expense Reference ID,Tax Type,TDS_Name,TDS_Percentage,Branch Name,Employee Email,CF.company,Project Name,Tags\n";
    
    const csvRows = expenseData.map((exp, index) => {
      const entryNumber = index + 1;
      const expenseDate = format(new Date(exp.invoiceDate), "yyyy-MM-dd");
      
      // Expense Account from categories.account_code (numeric code)
      const expenseAccount = exp.categoryAccountCode || "";
      // Expense Account Name from categories.account_name (descriptive)
      const expenseAccountName = exp.categoryAccountName || "";
      
      // Paid Through from payment_methods_mapping.zoho_name (with fallback)
      const paidThrough = exp.paymentZohoName || exp.paymentType;
      if (!exp.paymentZohoName && exp.paymentType) {
        console.warn(`Mode paiement non mappé : ${exp.paymentType}`);
      }
      
      // Vendor in Title Case
      const vendor = toTitleCase(exp.supplierName || "");
      
      // Expense Amount logic:
      // Priority: 
      // 1. If TVA applicable: use amountHT (Zoho will add the 18% tax)
      // 2. If BRS: use amountRealTTC (brut = net/0.95, Zoho calculates the 5% deduction)
      // 3. Otherwise: use amountDisplayTTC (what user entered)
      let expenseAmount: string;
      if (exp.vatApplicable && exp.amountHT) {
        // TVA case: export HT, Zoho adds 18% tax
        expenseAmount = parseFloat(exp.amountHT).toFixed(2);
      } else if (exp.hasBrs) {
        // BRS case (no TVA): export brut amount
        expenseAmount = parseFloat(exp.amountRealTTC || exp.amountDisplayTTC).toFixed(2);
      } else {
        // Simple case: no TVA, no BRS
        expenseAmount = parseFloat(exp.amountDisplayTTC).toFixed(2);
      }
      
      // Tax fields: only if VAT applicable (export HT, Zoho adds tax)
      const taxName = exp.vatApplicable ? "TVA" : "";
      const taxPercentage = exp.vatApplicable ? "18" : "";
      const isInclusiveTax = exp.vatApplicable ? "FALSE" : "";
      
      // TDS fields: only if BRS applicable (Zoho calculates the 5% deduction)
      const tdsName = exp.hasBrs ? "BRS" : "";
      const tdsPercentage = exp.hasBrs ? "5" : "";
      
      // Reference# = invoice_number (DEP-XX-YYMM-XXX)
      const reference = exp.invoiceNumber || "";
      
      // Project Name and Tags logic: MPP, RD, Structure go to Tags instead of Project Name
      const projectValue = exp.projectName || "";
      let projectName = "";
      let tags = "";
      
      if (projectValue === "MPP" || projectValue === "RD" || projectValue === "Structure") {
        tags = projectValue;  // Va dans Tags
        projectName = "";     // Project Name reste vide
      } else {
        projectName = projectValue;  // Va dans Project Name
        tags = "";                    // Tags reste vide
      }
      
      // Escape function for CSV values with commas
      const escapeCSV = (val: string) => {
        if (val && (val.includes(",") || val.includes('"') || val.includes("\n"))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val || "";
      };

      return [
        entryNumber,                          // Entry Number
        expenseDate,                          // Expense Date
        escapeCSV(expenseAccount),            // Expense Account (code)
        escapeCSV(expenseAccountName),        // Expense Account Name (descriptive)
        escapeCSV(paidThrough),               // Paid Through
        escapeCSV(vendor),                    // Vendor (Title Case)
        escapeCSV(exp.description),           // Expense Description
        "XOF",                                // Currency Code
        "1",                                  // Exchange Rate
        expenseAmount,                        // Expense Amount
        taxName,                              // Tax Name
        taxPercentage,                        // Tax Percentage
        isInclusiveTax,                       // Is Inclusive Tax
        "False",                              // Is Billable
        "",                                   // Customer Name
        reference,                            // Reference#
        "",                                   // Mileage Rate
        "",                                   // Distance
        "",                                   // Start Odometer Reading
        "",                                   // End Odometer Reading
        "",                                   // Mileage Unit
        "NonMileage",                         // Mileage Type
        "",                                   // Expense Reference ID
        "",                                   // Tax Type
        tdsName,                              // TDS_Name (BRS if applicable)
        tdsPercentage,                        // TDS_Percentage (5 if BRS)
        "",                                   // Branch Name
        "",                                   // Employee Email
        "",                                   // CF.company
        escapeCSV(projectName),               // Project Name
        escapeCSV(tags),                      // Tags (MPP, RD, Structure)
      ].join(",");
    });

    return csvHeader + csvRows.join("\n");
  }

  // Admin export Zoho Expenses CSV (protected)
  app.get("/api/admin/export-zoho-expenses", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const { user, date_start, date_end } = req.query;
      
      // Build WHERE conditions
      const conditions: any[] = [
        eq(invoices.invoiceType, "expense"),
        isNull(invoices.archive),
      ];
      
      // Filter by user if specified
      if (user && user !== "all") {
        const userName = String(user).charAt(0).toUpperCase() + String(user).slice(1).toLowerCase();
        conditions.push(eq(invoices.userName, userName));
      }
      
      // Filter by date range if specified
      if (date_start) {
        conditions.push(gte(invoices.invoiceDate, new Date(String(date_start))));
      }
      if (date_end) {
        const endDate = new Date(String(date_end));
        endDate.setHours(23, 59, 59, 999);
        conditions.push(lte(invoices.invoiceDate, endDate));
      }
      
      // Query with all necessary joins including payment_methods_mapping
      const result = await db
        .select({
          id: invoices.id,
          userName: invoices.userName,
          invoiceDate: invoices.invoiceDate,
          supplierId: invoices.supplierId,
          supplierName: suppliers.name,
          amountDisplayTTC: invoices.amountDisplayTTC,
          amountHT: invoices.amountHT,
          amountRealTTC: invoices.amountRealTTC,
          vatApplicable: invoices.vatApplicable,
          hasBrs: invoices.hasBrs,
          description: invoices.description,
          paymentType: invoices.paymentType,
          invoiceNumber: invoices.invoiceNumber,
          projectId: invoices.projectId,
          projectName: projects.name,
          categoryId: invoices.categoryId,
          categoryAccountName: categories.accountName,
          categoryAccountCode: categories.accountCode,
          paymentZohoName: paymentMethodsMapping.zohoName,
        })
        .from(invoices)
        .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
        .leftJoin(projects, eq(invoices.projectId, projects.id))
        .leftJoin(categories, eq(invoices.categoryId, categories.id))
        .leftJoin(paymentMethodsMapping, eq(invoices.paymentType, paymentMethodsMapping.appName))
        .where(and(...conditions))
        .orderBy(asc(invoices.invoiceDate));
      
      // Generate filename
      const userLabel = user === "all" ? "Toutes" : String(user).charAt(0).toUpperCase() + String(user).slice(1).toLowerCase();
      const dateLabel = date_end ? format(new Date(String(date_end)), "yyyyMM") : format(new Date(), "yyyyMM");
      const filename = `Depenses_${userLabel}_${dateLabel}.csv`;
      
      // Generate CSV
      const csv = generateZohoExpenseCSV(result);
      
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Export-Count", result.length.toString());
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting Zoho Expenses CSV:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================
  // ZOHO EXPORTS - Factures Fournisseurs (Bills)
  // ============================================

  // Helper function to generate Zoho CSV for supplier invoices (Bills format - 33 columns with TDS)
  function generateZohoBillsCSV(billsData: any[]): string {
    // Headers exactly as in Zoho Books Bills import template (33 columns - added TDS_Name, TDS_Percentage)
    const csvHeader = "Bill Date,Bill Number,PurchaseOrder,Bill Status,Vendor Name,Due Date,Currency Code,Exchange Rate,Account,Account Name,Description,Quantity,Rate,Tax Name,Tax Percentage,Is Inclusive Tax,Tax Type,TDS_Name,TDS_Percentage,Vendor Notes,Terms & Conditions,Customer Name,Project Name,Tags,Item Type,Adjustment,Purchase Order Number,Is Discount Before Tax,Entity Discount Amount,Discount Account,Is Landed Cost,Warehouse Name,Branch Name\n";
    
    const csvRows = billsData.map((bill) => {
      const billDate = format(new Date(bill.invoiceDate), "yyyy-MM-dd");
      
      // Account from categories.account_code (numeric code)
      const account = bill.categoryAccountCode || "";
      // Account Name from categories.account_name (descriptive)
      const accountName = bill.categoryAccountName || "";
      
      // Vendor in Title Case
      const vendorName = toTitleCase(bill.supplierName || "");
      
      // Rate logic:
      // Priority: 
      // 1. If TVA applicable: use amountHT (Zoho will add the 18% tax)
      // 2. If BRS: use amountRealTTC (brut = net/0.95, Zoho calculates the 5% deduction)
      // 3. Otherwise: use amountDisplayTTC (what user entered)
      let rate: string;
      if (bill.vatApplicable && bill.amountHT) {
        // TVA case: export HT, Zoho adds 18% tax
        rate = parseFloat(bill.amountHT).toFixed(2);
      } else if (bill.hasBrs) {
        // BRS case (no TVA): export brut amount
        rate = parseFloat(bill.amountRealTTC || bill.amountDisplayTTC).toFixed(2);
      } else {
        // Simple case: no TVA, no BRS
        rate = parseFloat(bill.amountDisplayTTC).toFixed(2);
      }
      
      // Tax fields: only if VAT applicable (export HT, Zoho adds tax)
      const taxName = bill.vatApplicable ? "TVA" : "";
      const taxPercentage = bill.vatApplicable ? "18" : "";
      const isInclusiveTax = bill.vatApplicable ? "FALSE" : "";
      const taxType = bill.vatApplicable ? "ItemAmount" : "";
      
      // TDS fields: only if BRS applicable (Zoho calculates the 5% deduction)
      const tdsName = bill.hasBrs ? "BRS" : "";
      const tdsPercentage = bill.hasBrs ? "5" : "";
      
      // Project Name and Tags logic: MPP, RD, Structure go to Tags instead of Project Name
      const projectValue = bill.projectName || "";
      let projectName = "";
      let tags = "";
      
      if (projectValue === "MPP" || projectValue === "RD" || projectValue === "Structure") {
        tags = projectValue;  // Va dans Tags
        projectName = "";     // Project Name reste vide
      } else {
        projectName = projectValue;  // Va dans Project Name
        tags = "";                    // Tags reste vide
      }
      
      // Escape function for CSV values with commas
      const escapeCSV = (val: string) => {
        if (val && (val.includes(",") || val.includes('"') || val.includes("\n"))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val || "";
      };

      return [
        billDate,                             // Bill Date
        escapeCSV(bill.invoiceNumber || ""),  // Bill Number
        "",                                   // PurchaseOrder
        "Open",                               // Bill Status
        escapeCSV(vendorName),                // Vendor Name (Title Case)
        billDate,                             // Due Date (same as Bill Date)
        "XOF",                                // Currency Code
        "1",                                  // Exchange Rate
        escapeCSV(account),                   // Account (code)
        escapeCSV(accountName),               // Account Name (descriptive)
        escapeCSV(bill.description),          // Description
        "1",                                  // Quantity
        rate,                                 // Rate
        taxName,                              // Tax Name
        taxPercentage,                        // Tax Percentage
        isInclusiveTax,                       // Is Inclusive Tax
        taxType,                              // Tax Type
        tdsName,                              // TDS_Name (BRS if applicable)
        tdsPercentage,                        // TDS_Percentage (5 if BRS)
        "",                                   // Vendor Notes
        "",                                   // Terms & Conditions
        "",                                   // Customer Name
        escapeCSV(projectName),               // Project Name
        escapeCSV(tags),                      // Tags (MPP, RD, Structure)
        "goods",                              // Item Type
        "0",                                  // Adjustment
        "",                                   // Purchase Order Number
        "FALSE",                              // Is Discount Before Tax
        "0",                                  // Entity Discount Amount
        "",                                   // Discount Account
        "FALSE",                              // Is Landed Cost
        "",                                   // Warehouse Name
        "",                                   // Branch Name
      ].join(",");
    });

    return csvHeader + csvRows.join("\n");
  }

  // Admin export Zoho Bills CSV (protected) - Supplier Invoices only
  app.get("/api/admin/export-zoho-bills", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const { user, date_start, date_end } = req.query;
      
      // Build WHERE conditions - supplier_invoice only (not expenses)
      const conditions: any[] = [
        eq(invoices.invoiceType, "supplier_invoice"),
        isNull(invoices.archive),
      ];
      
      // Filter by user if specified
      if (user && user !== "all") {
        const userName = String(user).charAt(0).toUpperCase() + String(user).slice(1).toLowerCase();
        conditions.push(eq(invoices.userName, userName));
      }
      
      // Filter by date range if specified
      if (date_start) {
        conditions.push(gte(invoices.invoiceDate, new Date(String(date_start))));
      }
      if (date_end) {
        const endDate = new Date(String(date_end));
        endDate.setHours(23, 59, 59, 999);
        conditions.push(lte(invoices.invoiceDate, endDate));
      }
      
      // Query with necessary joins (no payment_methods_mapping for Bills)
      const result = await db
        .select({
          id: invoices.id,
          userName: invoices.userName,
          invoiceDate: invoices.invoiceDate,
          supplierId: invoices.supplierId,
          supplierName: suppliers.name,
          amountDisplayTTC: invoices.amountDisplayTTC,
          amountHT: invoices.amountHT,
          amountRealTTC: invoices.amountRealTTC,
          vatApplicable: invoices.vatApplicable,
          hasBrs: invoices.hasBrs,
          description: invoices.description,
          invoiceNumber: invoices.invoiceNumber,
          projectId: invoices.projectId,
          projectName: projects.name,
          categoryId: invoices.categoryId,
          categoryAccountName: categories.accountName,
          categoryAccountCode: categories.accountCode,
        })
        .from(invoices)
        .leftJoin(suppliers, eq(invoices.supplierId, suppliers.id))
        .leftJoin(projects, eq(invoices.projectId, projects.id))
        .leftJoin(categories, eq(invoices.categoryId, categories.id))
        .where(and(...conditions))
        .orderBy(asc(invoices.invoiceDate));
      
      // Generate filename
      const userLabel = user === "all" ? "Toutes" : String(user).charAt(0).toUpperCase() + String(user).slice(1).toLowerCase();
      const dateLabel = date_end ? format(new Date(String(date_end)), "yyyyMM") : format(new Date(), "yyyyMM");
      const filename = `Factures_Fournisseurs_${userLabel}_${dateLabel}.csv`;
      
      // Generate CSV
      const csv = generateZohoBillsCSV(result);
      
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Export-Count", result.length.toString());
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting Zoho Bills CSV:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export new BRS suppliers - suppliers created during period with BRS invoices
  app.get("/api/admin/export-nouveaux-fournisseurs-brs", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const { date_start, date_end } = req.query;
      
      // Validate required dates
      if (!date_start || !date_end) {
        return res.status(400).json({ message: "Les dates de début et fin sont obligatoires" });
      }
      
      const startDate = new Date(String(date_start));
      const endDate = new Date(String(date_end));
      endDate.setHours(23, 59, 59, 999);
      
      // Validate date order
      if (startDate > endDate) {
        return res.status(400).json({ message: "Date de début doit être avant date de fin" });
      }
      
      // Query: suppliers created during period with BRS supplier invoices
      // JOIN suppliers with invoices, filter by:
      // - suppliers.created_at >= date_start (created during or after start of period)
      // - invoices.invoice_type = 'supplier_invoice'
      // - invoices.has_brs = true
      // - invoices.invoice_date between date_start and date_end
      // - NOT archived
      const result = await db
        .select({
          supplierName: suppliers.name,
          supplierCreatedAt: suppliers.createdAt,
          brsInvoiceCount: count(invoices.id),
        })
        .from(suppliers)
        .innerJoin(invoices, eq(invoices.supplierId, suppliers.id))
        .where(
          and(
            gte(suppliers.createdAt, startDate),
            eq(invoices.invoiceType, "supplier_invoice"),
            eq(invoices.hasBrs, true),
            gte(invoices.invoiceDate, startDate),
            lte(invoices.invoiceDate, endDate),
            isNull(invoices.archive)
          )
        )
        .groupBy(suppliers.id, suppliers.name, suppliers.createdAt)
        .orderBy(asc(suppliers.createdAt));
      
      // If no suppliers found
      if (result.length === 0) {
        return res.status(200).json({ 
          message: "Aucun nouveau fournisseur BRS trouvé pour cette période",
          count: 0
        });
      }
      
      // Helper to escape CSV values
      const escapeCSV = (val: string) => {
        if (!val) return "";
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };
      
      // Generate CSV with 3 columns: Nom Fournisseur, Date Création, Nombre Factures BRS
      // Use comma separator per spec
      const csvHeader = "Nom Fournisseur,Date Création,Nombre Factures BRS\n";
      const csvRows = result.map(row => {
        const supplierName = escapeCSV(row.supplierName || "");
        const createdDate = row.supplierCreatedAt ? format(new Date(row.supplierCreatedAt), "dd/MM/yyyy") : "";
        const invoiceCount = String(row.brsInvoiceCount);
        return `${supplierName},${createdDate},${invoiceCount}`;
      }).join("\n");
      
      const csv = csvHeader + csvRows;
      
      // Filename: Nouveaux_Fournisseurs_BRS_YYYYMM.csv (based on end date)
      const dateLabel = format(endDate, "yyyyMM");
      const filename = `Nouveaux_Fournisseurs_BRS_${dateLabel}.csv`;
      
      res.setHeader("Cache-Control", "no-store, no-cache");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Export-Count", result.length.toString());
      res.send("\ufeff" + csv); // UTF-8 BOM for Excel compatibility
    } catch (error) {
      console.error("Error exporting new BRS suppliers:", error);
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

  // ==================== PAYMENT ROUTES ====================

  // Get invoice with payments
  app.get("/api/invoice/:id/with-payments", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const invoice = await storage.getInvoiceWithPayments(id);

      if (!invoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }

      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice with payments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get invoices with payments for a user
  app.get("/api/invoices-with-payments/:userName", async (req: Request, res: Response) => {
    try {
      const { userName } = req.params;
      const { type, category_id, has_brs, is_stock_purchase, payment_status, sort_by, sort_order } = req.query;

      const filters: {
        type?: 'expense' | 'supplier_invoice' | 'all';
        categoryId?: number | 'all';
        hasBrs?: boolean;
        isStockPurchase?: boolean;
        paymentStatus?: 'paid' | 'partial' | 'unpaid' | 'all';
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

      if (payment_status && ['paid', 'partial', 'unpaid', 'all'].includes(payment_status as string)) {
        filters.paymentStatus = payment_status as 'paid' | 'partial' | 'unpaid' | 'all';
      }

      if (sort_by && ['date', 'supplier', 'amount'].includes(sort_by as string)) {
        filters.sortBy = sort_by as 'date' | 'supplier' | 'amount';
      }

      if (sort_order && ['asc', 'desc'].includes(sort_order as string)) {
        filters.sortOrder = sort_order as 'asc' | 'desc';
      }

      const invoices = await storage.getInvoicesWithPaymentsByUser(userName, filters);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices with payments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create a payment for a supplier invoice
  app.post("/api/payments", async (req: Request, res: Response) => {
    try {
      const { token, invoiceId, amountPaid, paymentDate, paymentType } = req.body;

      // Validate token
      if (!token) {
        return res.status(401).json({ message: "Token requis" });
      }

      const userToken = await storage.getUserTokenByToken(token);
      if (!userToken) {
        return res.status(401).json({ message: "Token invalide" });
      }

      // Get the invoice
      const invoice = await storage.getInvoiceById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Facture introuvable" });
      }

      // Check that user owns this invoice
      if (invoice.userName !== userToken.name) {
        return res.status(403).json({ message: "Seul le créateur de la facture peut ajouter un paiement" });
      }

      // Check invoice is supplier_invoice type
      if (invoice.invoiceType !== 'supplier_invoice') {
        return res.status(400).json({ message: "Seules les factures fournisseur peuvent avoir des paiements multiples" });
      }

      // Check invoice is not already paid
      if (invoice.paymentStatus === 'paid') {
        return res.status(400).json({ message: "Cette facture est déjà soldée" });
      }

      // Calculate remaining amount
      const totalPaid = await storage.getTotalPaidForInvoice(invoiceId);
      const amountToPay = parseFloat(invoice.amountDisplayTTC?.toString() || "0");
      const remaining = amountToPay - totalPaid;

      // Validate amount
      const amount = parseFloat(amountPaid);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Le montant doit être supérieur à 0" });
      }
      if (amount > remaining + 0.01) { // Small tolerance for rounding
        return res.status(400).json({ message: `Le montant ne peut pas dépasser le reste à payer (${remaining.toFixed(2)} F)` });
      }

      // Validate payment date
      if (!paymentDate) {
        return res.status(400).json({ message: "Date de paiement requise" });
      }
      const payDate = new Date(paymentDate);
      const invoiceDate = new Date(invoice.invoiceDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (payDate < invoiceDate) {
        return res.status(400).json({ message: "La date de paiement ne peut pas être antérieure à la date de la facture" });
      }
      if (payDate > today) {
        return res.status(400).json({ message: "La date de paiement ne peut pas être dans le futur" });
      }

      // Validate payment type
      if (!paymentType) {
        return res.status(400).json({ message: "Type de règlement requis" });
      }

      // Create the payment
      const payment = await storage.createPayment({
        invoiceId,
        amountPaid: amount.toString(),
        paymentDate: format(payDate, 'yyyy-MM-dd'),
        paymentType,
        createdBy: userToken.id,
      });

      // Update payment status
      const updatedInvoice = await storage.updateInvoicePaymentStatus(invoiceId);

      // Get updated invoice with all payments
      const invoiceWithPayments = await storage.getInvoiceWithPayments(invoiceId);

      console.log(`[INFO] Payment added - Invoice: ${invoiceId} - Amount: ${amount} - User: ${userToken.name} - NewStatus: ${updatedInvoice?.paymentStatus}`);

      // Send email notification
      try {
        const userEmail = userToken?.email || 
          (userToken.name === "Michael" ? "michael@filtreplante.com" : 
           userToken.name === "Marine" ? "marine@filtreplante.com" : 
           "fatou@filtreplante.com");
        
        // Get supplier name
        const supplier = invoice.supplierId ? await storage.getSupplierById(invoice.supplierId) : null;
        
        // Calculate new totals
        const newTotalPaid = await storage.getTotalPaidForInvoice(invoiceId);
        const newRemaining = amountToPay - newTotalPaid;

        await sendPaymentConfirmation(userEmail, userToken.name, userToken.token, {
          supplierName: supplier?.name || "N/A",
          invoiceNumber: invoice.invoiceNumber || null,
          invoiceAmount: amountToPay.toLocaleString("fr-FR"),
          paymentAmount: amount.toLocaleString("fr-FR"),
          paymentDate: format(payDate, "d MMMM yyyy", { locale: fr }),
          paymentType,
          totalPaid: newTotalPaid.toLocaleString("fr-FR"),
          remainingAmount: newRemaining.toLocaleString("fr-FR"),
          paymentStatus: updatedInvoice?.paymentStatus || "partial",
        });
      } catch (emailError) {
        console.error("Error sending payment email:", emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json({
        success: true,
        payment,
        invoice: invoiceWithPayments,
      });
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new project (admin protected)
  app.post("/api/admin/projects", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const { number, name, startDate } = req.body;
      if (!number?.trim() || !name?.trim()) {
        return res.status(400).json({ message: "Le numéro et le nom du projet sont requis" });
      }
      const existing = await db.select().from(projects).where(eq(projects.number, number.trim())).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Un projet avec ce numéro existe déjà" });
      }
      const [created] = await db.insert(projects).values({
        number: number.trim(),
        name: name.trim(),
        startDate: startDate?.trim() || null,
      }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Toggle project completion status (admin protected)
  app.put("/api/admin/projects/:id/toggle-completed", verifyAdminAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      if (!project.length) {
        return res.status(404).json({ message: "Projet introuvable" });
      }
      const newStatus = !project[0].isCompleted;
      await db.update(projects).set({ isCompleted: newStatus }).where(eq(projects.id, id));
      res.json({ id, isCompleted: newStatus });
    } catch (error) {
      console.error("Error toggling project completion:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
