import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, FileText, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { SupplierSearch } from "./SupplierSearch";
import { ProjectSelect } from "./ProjectSelect";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface Supplier {
  id: string;
  name: string;
  total?: string;
  isRegularSupplier?: boolean;
}

interface Project {
  id: string;
  number: string;
  name: string;
  startDate?: string | null;
}

interface Category {
  id: number;
  zohoAccountId: string;
  accountName: string;
  appName: string;
  accountCode: string;
  description: string | null;
  accountType: string;
  currency: string;
}

interface InvoiceFormProps {
  userName: string;
  suppliers: Supplier[];
  recentSuppliers: Supplier[];
  topVolumeSuppliers: Supplier[];
  projects: Project[];
  onSubmit: (data: InvoiceFormData & { file: File }) => Promise<void>;
  onCreateSupplier: (name: string) => Promise<void>;
}

const invoiceFormSchema = z.object({
  invoiceDate: z.string().min(1, "La date est requise"),
  supplierId: z.string().min(1, "Le fournisseur est requis"),
  amountDisplayTTC: z.string().min(1, "Le montant TTC est requis"),
  isStockPurchase: z.boolean(),
  categoryId: z.string().min(1, "La catégorie est requise"),
  category: z.string().min(1, "La catégorie est requise"),
  vatApplicable: z.boolean(),
  hasBrs: z.boolean(),
  invoiceType: z.enum(["expense", "supplier_invoice"]),
  invoiceNumber: z.string().optional(),
  description: z.string().min(1, "La description est requise"),
  paymentType: z.string().min(1, "Le type de règlement est requis"),
  projectId: z.string().optional(),
  amountHT: z.number().optional().nullable(),
  amountRealTTC: z.number().optional().nullable(),
}).refine(
  (data) => {
    if (data.invoiceType === "supplier_invoice" && (!data.invoiceNumber || data.invoiceNumber.trim() === "")) {
      return false;
    }
    return true;
  },
  {
    message: "Le numéro de facture est requis pour les Factures Fournisseur",
    path: ["invoiceNumber"],
  }
);

export type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

const formatAmount = (amount: number | string | null): string => {
  if (!amount) return "0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return Math.round(num).toLocaleString("fr-FR");
};

export function InvoiceForm({
  userName,
  suppliers,
  recentSuppliers,
  topVolumeSuppliers,
  projects,
  onSubmit,
  onCreateSupplier,
}: InvoiceFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [amountHT, setAmountHT] = useState<number | null>(null);
  const [amountRealTTC, setAmountRealTTC] = useState<number | null>(null);

  const [showAmountHT, setShowAmountHT] = useState(false);
  const [showBRSField, setShowBRSField] = useState(false);
  const [showRealAmountField, setShowRealAmountField] = useState(false);
  const [showInvoiceNumberField, setShowInvoiceNumberField] = useState(false);
  const [isCategoryDisabled, setIsCategoryDisabled] = useState(false);
  const [isTVADisabled, setIsTVADisabled] = useState(false);
  const [isInvoiceTypeDisabled, setIsInvoiceTypeDisabled] = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const isFatou = userName === "Fatou";
  const defaultPaymentType = isFatou ? "Wave Business Caisse" : "Wave Business";

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceDate: new Date().toISOString().split("T")[0],
      supplierId: "",
      amountDisplayTTC: "",
      isStockPurchase: false,
      categoryId: "",
      category: "",
      vatApplicable: false,
      hasBrs: false,
      invoiceType: "expense",
      invoiceNumber: "",
      description: "",
      paymentType: defaultPaymentType,
      projectId: "",
      amountHT: null,
      amountRealTTC: null,
    },
  });

  const supplierId = form.watch("supplierId");
  const amountDisplayTTC = form.watch("amountDisplayTTC");
  const isStockPurchase = form.watch("isStockPurchase");
  const categoryId = form.watch("categoryId");
  const vatApplicable = form.watch("vatApplicable");
  const hasBrs = form.watch("hasBrs");
  const invoiceType = form.watch("invoiceType");

  const handleSupplierChange = (id: string) => {
    form.setValue("supplierId", id);
    const supplier = suppliers.find((s) => s.id === id);
    setSelectedSupplier(supplier || null);
  };

  const handleCategoryChange = (id: string) => {
    form.setValue("categoryId", id);
    const category = categories.find((c) => c.id === parseInt(id));
    setSelectedCategory(category || null);
    if (category) {
      form.setValue("category", category.appName);
    }
  };

  useEffect(() => {
    if (!categories.length) return;

    const stockCategory = categories.find(
      (c) => c.accountCode === "3210000000"
    );

    if (isStockPurchase && stockCategory) {
      form.setValue("categoryId", stockCategory.id.toString());
      form.setValue("category", stockCategory.appName);
      setSelectedCategory(stockCategory);
      setIsCategoryDisabled(true);
    } else {
      setIsCategoryDisabled(false);
    }
  }, [isStockPurchase, categories, form]);

  useEffect(() => {
    if (!selectedCategory) {
      setIsTVADisabled(false);
      return;
    }

    const accountName = selectedCategory.accountName;

    if (
      accountName === "Réceptions" ||
      accountName === "Fournitures non stockables - Energies"
    ) {
      form.setValue("vatApplicable", false);
      setIsTVADisabled(true);
    } else {
      setIsTVADisabled(false);
    }
  }, [selectedCategory, form]);

  useEffect(() => {
    const amount = parseFloat(amountDisplayTTC) || 0;
    if (vatApplicable && amount > 0) {
      const ht = amount / 1.18;
      setAmountHT(ht);
      setShowAmountHT(true);
    } else {
      setAmountHT(null);
      setShowAmountHT(false);
    }
  }, [vatApplicable, amountDisplayTTC]);

  useEffect(() => {
    if (!selectedCategory) {
      setShowBRSField(false);
      form.setValue("hasBrs", false);
      return;
    }

    const accountName = selectedCategory.accountName;
    const isPrestationServices = accountName === "Achats d'études et prestations de services";

    if (!vatApplicable && isPrestationServices) {
      setShowBRSField(true);
    } else {
      setShowBRSField(false);
      form.setValue("hasBrs", false);
      setAmountRealTTC(null);
      setShowRealAmountField(false);
    }
  }, [vatApplicable, selectedCategory, form]);

  useEffect(() => {
    const amount = parseFloat(amountDisplayTTC) || 0;

    if (!showBRSField || amount <= 0) {
      setAmountRealTTC(null);
      setShowRealAmountField(false);
      return;
    }

    if (hasBrs) {
      const realTTC = amount / 0.95;
      setAmountRealTTC(realTTC);
      setShowRealAmountField(true);
    } else {
      setAmountRealTTC(amount);
      setShowRealAmountField(false);
    }
  }, [hasBrs, showBRSField, amountDisplayTTC]);

  useEffect(() => {
    const amount = parseFloat(amountDisplayTTC) || 0;
    const accountName = selectedCategory?.accountName;

    if (
      amount >= 500000 ||
      selectedSupplier?.isRegularSupplier === true ||
      hasBrs === true
    ) {
      form.setValue("invoiceType", "supplier_invoice");
      setIsInvoiceTypeDisabled(true);
      return;
    }

    if (
      selectedCategory &&
      (accountName === "Réceptions" ||
        accountName === "Fournitures non stockables - Energies")
    ) {
      form.setValue("invoiceType", "expense");
      setIsInvoiceTypeDisabled(true);
      return;
    }

    setIsInvoiceTypeDisabled(false);
  }, [amountDisplayTTC, selectedSupplier, hasBrs, selectedCategory, form]);

  useEffect(() => {
    if (invoiceType === "supplier_invoice") {
      setShowInvoiceNumberField(true);
    } else {
      setShowInvoiceNumberField(false);
      form.setValue("invoiceNumber", "");
    }
  }, [invoiceType, form]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isImage = file.type.startsWith("image/");
      const isPDF = file.type === "application/pdf";

      if (!isImage && !isPDF) {
        toast({
          title: "Type de fichier non valide",
          description: "Veuillez sélectionner un fichier PDF ou une image",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (data: InvoiceFormData) => {
    if (!selectedFile) {
      toast({
        title: "Fichier requis",
        description: "Veuillez télécharger une copie de la facture",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const submitData = {
        ...data,
        amountHT: amountHT,
        amountRealTTC: amountRealTTC,
        file: selectedFile,
      };
      await onSubmit(submitData);
      setIsSuccess(true);
      form.reset({
        invoiceDate: new Date().toISOString().split("T")[0],
        supplierId: "",
        amountDisplayTTC: "",
        isStockPurchase: false,
        categoryId: "",
        category: "",
        vatApplicable: false,
        hasBrs: false,
        invoiceType: "expense",
        invoiceNumber: "",
        description: "",
        paymentType: defaultPaymentType,
        projectId: "",
        amountHT: null,
        amountRealTTC: null,
      });
      setSelectedFile(null);
      setSelectedSupplier(null);
      setSelectedCategory(null);
      setAmountHT(null);
      setAmountRealTTC(null);

      setTimeout(() => setIsSuccess(false), 5000);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la soumission",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <Card className="p-8 bg-primary/5 border-primary/20">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-6">
              <CheckCircle2 className="h-16 w-16 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-primary">Facture soumise avec succès</h2>
            <p className="text-muted-foreground">
              Votre facture a été enregistrée et un email de confirmation a été envoyé.
            </p>
          </div>
          <Button
            onClick={() => setIsSuccess(false)}
            size="lg"
            className="h-14"
            data-testid="button-submit-another"
          >
            Soumettre une nouvelle facture
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="userName" className="text-base font-medium">
          Nom
        </Label>
        <Input
          id="userName"
          value={userName}
          disabled
          className="h-14 text-base bg-muted"
          data-testid="input-user-name"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-base font-medium">Fournisseur *</Label>
        <SupplierSearch
          suppliers={suppliers}
          recentSuppliers={recentSuppliers}
          topVolumeSuppliers={topVolumeSuppliers}
          value={supplierId}
          onSelect={handleSupplierChange}
          onCreateNew={onCreateSupplier}
        />
        {form.formState.errors.supplierId && (
          <p className="text-sm text-destructive">{form.formState.errors.supplierId.message}</p>
        )}
        {selectedSupplier?.isRegularSupplier && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md text-sm text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>Fournisseur régulier - Facture Fournisseur requise</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="amountDisplayTTC" className="text-base font-medium">
          Montant TTC affiché (FCFA) *
        </Label>
        <Input
          id="amountDisplayTTC"
          type="number"
          step="1"
          min="0"
          placeholder="Ex: 50000"
          {...form.register("amountDisplayTTC")}
          className="h-14 text-base"
          data-testid="input-amount-ttc"
        />
        {form.formState.errors.amountDisplayTTC && (
          <p className="text-sm text-destructive">{form.formState.errors.amountDisplayTTC.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="isStockPurchase" className="text-base font-medium">
            Achat pour le stock ?
          </Label>
          <Switch
            id="isStockPurchase"
            checked={isStockPurchase}
            onCheckedChange={(checked) => form.setValue("isStockPurchase", checked)}
            data-testid="switch-stock-purchase"
          />
        </div>
        {isStockPurchase && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md text-sm text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>Catégorie automatique : Stock - achats de matériaux</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="categoryId" className="text-base font-medium">
          Catégorie *
        </Label>
        <Select
          value={categoryId}
          onValueChange={handleCategoryChange}
          disabled={isCategoryDisabled}
        >
          <SelectTrigger id="categoryId" className="h-14 text-base" data-testid="select-category">
            <SelectValue placeholder="Sélectionner une catégorie..." />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id.toString()} data-testid={`option-category-${cat.id}`}>
                {cat.appName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.categoryId && (
          <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="vatApplicable" className="text-base font-medium">
            TVA applicable (18%)
          </Label>
          <Switch
            id="vatApplicable"
            checked={vatApplicable}
            onCheckedChange={(checked) => form.setValue("vatApplicable", checked)}
            disabled={isTVADisabled}
            data-testid="switch-vat-applicable"
          />
        </div>
        {isTVADisabled && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md text-sm text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>TVA automatiquement NON pour cette catégorie</span>
          </div>
        )}
      </div>

      {showAmountHT && amountHT !== null && (
        <Card className="p-4 bg-muted/50">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Montant HT :</span>
              <span className="font-semibold">{formatAmount(amountHT)} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Montant TTC :</span>
              <span className="font-semibold">{formatAmount(amountDisplayTTC)} FCFA</span>
            </div>
          </div>
        </Card>
      )}

      {showBRSField && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="hasBrs" className="text-base font-medium">
              Montant total avec BRS mentionné
            </Label>
            <Switch
              id="hasBrs"
              checked={hasBrs}
              onCheckedChange={(checked) => form.setValue("hasBrs", checked)}
              data-testid="switch-has-brs"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            La retenue à la source (BRS) de 5% s'applique aux prestations de services sans TVA
          </p>
        </div>
      )}

      {showRealAmountField && amountRealTTC !== null && (
        <Card className="p-4 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-amber-800 dark:text-amber-200 font-medium">Montant TTC réel (comptable) :</span>
              <span className="font-bold text-amber-900 dark:text-amber-100">{formatAmount(amountRealTTC)} FCFA</span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Calculé automatiquement avec retenue à la source (BRS 5%)
            </p>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        <Label className="text-base font-medium">Type de facture *</Label>
        <Card className="p-3 bg-muted/30 text-sm">
          <p className="mb-2">
            <strong>Facture Fournisseur :</strong> Facture <strong>&gt;500k FCFA</strong>, à régler ultérieurement, 
            fournisseur régulier (CCS, Europe Bâche...) ou prestation avec BRS
          </p>
          <p>
            <strong>Dépense :</strong> Dépense <strong>&lt;500k FCFA</strong>, payée immédiatement, 
            pas de fournisseur régulier ni BRS
          </p>
        </Card>
        <RadioGroup
          value={invoiceType}
          onValueChange={(value) => form.setValue("invoiceType", value as "expense" | "supplier_invoice")}
          className="flex gap-6"
          disabled={isInvoiceTypeDisabled}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="expense" id="type-expense" data-testid="radio-type-expense" disabled={isInvoiceTypeDisabled} />
            <Label htmlFor="type-expense" className={`cursor-pointer font-normal ${isInvoiceTypeDisabled ? "opacity-50" : ""}`}>
              Dépense
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="supplier_invoice" id="type-supplier" data-testid="radio-type-supplier" disabled={isInvoiceTypeDisabled} />
            <Label htmlFor="type-supplier" className={`cursor-pointer font-normal ${isInvoiceTypeDisabled ? "opacity-50" : ""}`}>
              Facture Fournisseur
            </Label>
          </div>
        </RadioGroup>
        {isInvoiceTypeDisabled && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950 rounded-md text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Type de facture déterminé automatiquement selon les critères définis</span>
          </div>
        )}
      </div>

      {showInvoiceNumberField && (
        <div className="space-y-2">
          <Label htmlFor="invoiceNumber" className="text-base font-medium">
            Numéro de facture *
          </Label>
          <Input
            id="invoiceNumber"
            type="text"
            placeholder="Ex: FAC-2024-001"
            {...form.register("invoiceNumber")}
            className="h-14 text-base"
            data-testid="input-invoice-number"
          />
          {form.formState.errors.invoiceNumber && (
            <p className="text-sm text-destructive">{form.formState.errors.invoiceNumber.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description" className="text-base font-medium">
          Description *
        </Label>
        <Textarea
          id="description"
          placeholder="Détails de la facture..."
          {...form.register("description")}
          className="min-h-24 text-base resize-none"
          data-testid="textarea-description"
        />
        {form.formState.errors.description && (
          <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="invoiceDate" className="text-base font-medium">
          Date de la facture *
        </Label>
        <Input
          id="invoiceDate"
          type="date"
          {...form.register("invoiceDate")}
          className="h-14 text-base"
          data-testid="input-invoice-date"
        />
        {form.formState.errors.invoiceDate && (
          <p className="text-sm text-destructive">{form.formState.errors.invoiceDate.message}</p>
        )}
      </div>

      <ProjectSelect
        projects={projects}
        value={form.watch("projectId") || ""}
        onChange={(value) => form.setValue("projectId", value)}
      />

      <div className="space-y-2">
        <Label htmlFor="paymentType" className="text-base font-medium">
          Type de règlement *
        </Label>
        <Select
          value={form.watch("paymentType")}
          onValueChange={(value) => form.setValue("paymentType", value)}
        >
          <SelectTrigger id="paymentType" className="h-14 text-base" data-testid="select-payment-type">
            <SelectValue placeholder="Sélectionner un type de règlement..." />
          </SelectTrigger>
          <SelectContent>
            {isFatou ? (
              <>
                <SelectItem value="Wave Business Caisse" data-testid="option-payment-WaveBusinessCaisse">
                  Wave Business Caisse
                </SelectItem>
                <SelectItem value="Espèces" data-testid="option-payment-Especes">
                  Espèces
                </SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="Wave Business" data-testid="option-payment-WaveBusiness">
                  Wave Business
                </SelectItem>
                <SelectItem value="Espèces" data-testid="option-payment-Especes">
                  Espèces
                </SelectItem>
                <SelectItem value="Perso remboursé par Wave Business" data-testid="option-payment-PersoWaveBusiness">
                  Perso remboursé par Wave Business
                </SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
        {form.formState.errors.paymentType && (
          <p className="text-sm text-destructive">{form.formState.errors.paymentType.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="file-upload" className="text-base font-medium">
          Facture (PDF ou Image) *
        </Label>
        <div className="relative">
          <input
            id="file-upload"
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="sr-only"
            data-testid="input-file-upload"
          />
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover-elevate active-elevate-2 transition-colors"
          >
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Cliquez pour télécharger ou glissez-déposez
                </p>
                <p className="text-xs text-muted-foreground">PDF, JPG ou PNG</p>
              </div>
            )}
          </label>
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full h-14 text-base font-semibold"
        disabled={isSubmitting}
        data-testid="button-submit-invoice"
      >
        {isSubmitting ? "Soumission en cours..." : "Soumettre la facture"}
      </Button>
    </form>
  );
}
