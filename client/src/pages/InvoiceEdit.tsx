import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Pencil, AlertCircle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { SupplierSearch } from "@/components/SupplierSearch";
import { ProjectSelect } from "@/components/ProjectSelect";
import type { Supplier, Project, Category, UserToken } from "@shared/schema";

interface Invoice {
  id: string;
  userName: string;
  invoiceDate: string;
  supplierId: string;
  category: string;
  amountDisplayTTC: string;
  vatApplicable: boolean;
  amountHT?: string | null;
  amountRealTTC?: string | null;
  description?: string | null;
  paymentType: string;
  projectId?: string | null;
  fileName: string;
  invoiceType?: string;
  invoiceNumber?: string | null;
  isStockPurchase?: boolean;
  categoryId?: number | null;
  hasBrs?: boolean;
  supplierIsRegular?: boolean;
}

interface FormData {
  invoiceDate: string;
  supplierId: string;
  categoryId: string;
  amountDisplayTTC: string;
  isStockPurchase: boolean;
  vatApplicable: boolean;
  hasBrs: boolean;
  invoiceType: "expense" | "supplier_invoice";
  invoiceNumber: string;
  description: string;
  paymentType: string;
  projectId: string;
}

const BRS_CATEGORY_ACCOUNT_NAMES = [
  "Achats d'études et prestations de services",
  "Transports sur ventes",
  "Autres entretiens et réparations",
];

const sortCategories = (cats: Category[]) => {
  return [...cats].sort((a, b) => {
    if (a.accountName === "Achats de matières premières et fournitures") return -1;
    if (b.accountName === "Achats de matières premières et fournitures") return 1;
    if (a.accountName === "Achats d'études et prestations de services") return -1;
    if (b.accountName === "Achats d'études et prestations de services") return 1;
    return a.appName.localeCompare(b.appName);
  });
};

export default function InvoiceEdit() {
  const { invoiceId, userToken } = useParams();
  const urlUsername = userToken?.split("_")[0];
  const token = userToken?.split("_").slice(1).join("_");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: userData } = useQuery<UserToken>({
    queryKey: ["/api/validate-token", token],
    enabled: !!token,
  });

  const isValidUser =
    userData && urlUsername && userData.name.toLowerCase() === urlUsername.toLowerCase();

  const { data: invoice, isLoading: isLoadingInvoice } = useQuery<Invoice>({
    queryKey: ["/api/invoice", invoiceId],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const sortedCategories = sortCategories(categories);

  const [formData, setFormData] = useState<FormData>({
    invoiceDate: "",
    supplierId: "",
    categoryId: "",
    amountDisplayTTC: "",
    isStockPurchase: false,
    vatApplicable: false,
    hasBrs: false,
    invoiceType: "expense",
    invoiceNumber: "",
    description: "",
    paymentType: "",
    projectId: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [calculatedHT, setCalculatedHT] = useState<number | null>(null);
  const [calculatedBRS, setCalculatedBRS] = useState<{ realTTC: number; brs: number } | null>(null);
  const [forcedInvoiceType, setForcedInvoiceType] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (invoice && !initRef.current) {
      initRef.current = true;
      setFormData({
        invoiceDate: invoice.invoiceDate.split("T")[0],
        supplierId: invoice.supplierId,
        categoryId: invoice.categoryId?.toString() || "",
        amountDisplayTTC: invoice.amountDisplayTTC,
        isStockPurchase: invoice.isStockPurchase || false,
        vatApplicable: invoice.vatApplicable,
        hasBrs: invoice.hasBrs || false,
        invoiceType: (invoice.invoiceType as "expense" | "supplier_invoice") || "expense",
        invoiceNumber: invoice.invoiceNumber || "",
        description: invoice.description || "",
        paymentType: invoice.paymentType,
        projectId: invoice.projectId || "",
      });
    }
  }, [invoice]);

  const selectedCategory = categories.find((c) => c.id.toString() === formData.categoryId);
  const selectedSupplier = suppliers.find((s) => s.id === formData.supplierId);
  const amount = parseFloat(formData.amountDisplayTTC) || 0;

  const isRestaurantCategory = selectedCategory?.accountName === "Réceptions";
  const isEssenceCategory = selectedCategory?.accountName === "Fournitures non stockables - Energies";
  const isBrsCategory = selectedCategory && BRS_CATEGORY_ACCOUNT_NAMES.includes(selectedCategory.accountName);

  const stockCategoryId = categories.find((c) => c.accountCode === "3210000000")?.id.toString();

  useEffect(() => {
    if (formData.isStockPurchase && stockCategoryId && formData.categoryId !== stockCategoryId) {
      setFormData((prev) => ({ ...prev, categoryId: stockCategoryId }));
    }
  }, [formData.isStockPurchase, stockCategoryId]);

  useEffect(() => {
    if ((isRestaurantCategory || isEssenceCategory) && formData.vatApplicable) {
      setFormData((prev) => ({ ...prev, vatApplicable: false }));
    }
  }, [isRestaurantCategory, isEssenceCategory]);

  useEffect(() => {
    if (formData.vatApplicable && amount > 0) {
      setCalculatedHT(amount / 1.18);
    } else {
      setCalculatedHT(null);
    }
  }, [formData.vatApplicable, amount]);

  useEffect(() => {
    if (!formData.vatApplicable && isBrsCategory && amount > 0) {
      const realTTC = amount / 0.95;
      const brs = realTTC * 0.05;
      setCalculatedBRS({ realTTC, brs });
      if (!formData.hasBrs) {
        setFormData((prev) => ({ ...prev, hasBrs: true }));
      }
    } else {
      setCalculatedBRS(null);
      if (formData.hasBrs && (!isBrsCategory || formData.vatApplicable)) {
        setFormData((prev) => ({ ...prev, hasBrs: false }));
      }
    }
  }, [formData.vatApplicable, isBrsCategory, amount]);

  useEffect(() => {
    const mustBeSupplierInvoice =
      amount >= 500000 || selectedSupplier?.isRegularSupplier || formData.hasBrs;
    const mustBeExpense = isRestaurantCategory || isEssenceCategory;

    if (mustBeExpense) {
      if (formData.invoiceType !== "expense") {
        setFormData((prev) => ({ ...prev, invoiceType: "expense" }));
      }
      setForcedInvoiceType(true);
    } else if (mustBeSupplierInvoice) {
      if (formData.invoiceType !== "supplier_invoice") {
        setFormData((prev) => ({ ...prev, invoiceType: "supplier_invoice" }));
      }
      setForcedInvoiceType(true);
    } else {
      setForcedInvoiceType(false);
    }
  }, [amount, selectedSupplier?.isRegularSupplier, formData.hasBrs, isRestaurantCategory, isEssenceCategory]);

  const canUseWaveBusiness = invoice?.userName === "Michael" || invoice?.userName === "Marine";
  const isFatou = invoice?.userName === "Fatou";

  const recentSuppliers: Supplier[] = [];
  const topVolumeSuppliers = suppliers
    .filter((s) => s.total && parseFloat(s.total) > 0 && s.name !== "TOTAL ENERGIES")
    .sort((a, b) => parseFloat(b.total || "0") - parseFloat(a.total || "0"))
    .slice(0, 5);

  const updateInvoiceMutation = useMutation({
    mutationFn: async () => {
      const formDataToSend = new FormData();
      formDataToSend.append("token", token || "");
      formDataToSend.append("invoiceDate", formData.invoiceDate);
      formDataToSend.append("supplierId", formData.supplierId);
      formDataToSend.append("categoryId", formData.categoryId);
      formDataToSend.append("amountDisplayTTC", formData.amountDisplayTTC);
      formDataToSend.append("isStockPurchase", formData.isStockPurchase.toString());
      formDataToSend.append("vatApplicable", formData.vatApplicable.toString());
      formDataToSend.append("hasBrs", formData.hasBrs.toString());
      formDataToSend.append("invoiceType", formData.invoiceType);
      if (formData.invoiceType === "supplier_invoice") {
        formDataToSend.append("invoiceNumber", formData.invoiceNumber);
      }
      formDataToSend.append("description", formData.description);
      formDataToSend.append("paymentType", formData.paymentType);
      if (formData.projectId) {
        formDataToSend.append("projectId", formData.projectId);
      }
      if (selectedFile) {
        formDataToSend.append("file", selectedFile);
      }

      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        body: formDataToSend,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update invoice");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Succès",
        description: "La facture a été modifiée avec succès",
      });
      setLocation(`/tracking/${userToken}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de modifier la facture",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.invoiceDate) {
      toast({ title: "Erreur", description: "La date est requise", variant: "destructive" });
      return;
    }
    if (!formData.supplierId) {
      toast({ title: "Erreur", description: "Le fournisseur est requis", variant: "destructive" });
      return;
    }
    if (!formData.categoryId) {
      toast({ title: "Erreur", description: "La catégorie est requise", variant: "destructive" });
      return;
    }
    if (!formData.amountDisplayTTC || parseFloat(formData.amountDisplayTTC) <= 0) {
      toast({ title: "Erreur", description: "Le montant TTC est requis", variant: "destructive" });
      return;
    }
    if (!formData.description || formData.description.trim() === "") {
      toast({ title: "Erreur", description: "La description est requise", variant: "destructive" });
      return;
    }
    if (!formData.paymentType) {
      toast({ title: "Erreur", description: "Le type de règlement est requis", variant: "destructive" });
      return;
    }
    if (formData.invoiceType === "supplier_invoice" && !formData.invoiceNumber) {
      toast({ title: "Erreur", description: "Le numéro de facture est requis pour les Factures Fournisseur", variant: "destructive" });
      return;
    }

    updateInvoiceMutation.mutate();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  if (isLoadingInvoice || !invoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isValidUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-destructive mb-2">Accès refusé</h1>
          <p className="text-muted-foreground">
            Token d'accès invalide ou ne correspond pas au nom d'utilisateur.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-6 px-4 shadow-md">
        <div className="max-w-3xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => setLocation(`/tracking/${userToken}`)}
            className="mb-4 text-primary-foreground hover:bg-primary/80"
            data-testid="button-back-to-tracking"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Retour au suivi
          </Button>
          <div className="flex items-center gap-3">
            <Pencil className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Modifier la facture</h1>
              <p className="text-sm text-primary-foreground/90">{invoice.userName}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate" className="text-base font-medium">
                Date de la facture *
              </Label>
              <Input
                id="invoiceDate"
                type="date"
                value={formData.invoiceDate}
                onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                className="h-14 text-base"
                data-testid="input-invoice-date"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Fournisseur *</Label>
              <SupplierSearch
                suppliers={suppliers}
                recentSuppliers={recentSuppliers}
                topVolumeSuppliers={topVolumeSuppliers}
                value={formData.supplierId}
                onSelect={(supplierId) => setFormData({ ...formData, supplierId })}
                onCreateNew={async () => Promise.resolve()}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Achat pour le stock ?</Label>
              <RadioGroup
                value={formData.isStockPurchase ? "true" : "false"}
                onValueChange={(value) => setFormData({ ...formData, isStockPurchase: value === "true" })}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="true" id="stock-yes" data-testid="radio-stock-yes" />
                  <Label htmlFor="stock-yes" className="cursor-pointer font-normal">
                    Oui
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="false" id="stock-no" data-testid="radio-stock-no" />
                  <Label htmlFor="stock-no" className="cursor-pointer font-normal">
                    Non
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoryId" className="text-base font-medium">
                Catégorie comptable *
              </Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                disabled={formData.isStockPurchase}
              >
                <SelectTrigger id="categoryId" className="h-14 text-base" data-testid="select-category">
                  <SelectValue placeholder="Sélectionner une catégorie..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()} data-testid={`option-category-${cat.id}`}>
                      {cat.appName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amountDisplayTTC" className="text-base font-medium">
                Montant TTC (FCFA) *
              </Label>
              <Input
                id="amountDisplayTTC"
                type="number"
                step="1"
                value={formData.amountDisplayTTC}
                onChange={(e) => setFormData({ ...formData, amountDisplayTTC: e.target.value })}
                className="h-14 text-base"
                data-testid="input-amount-ttc"
              />
            </div>

            {!isRestaurantCategory && !isEssenceCategory && (
              <div className="space-y-2">
                <Label className="text-base font-medium">Facture avec TVA (18%) ?</Label>
                <RadioGroup
                  value={formData.vatApplicable ? "true" : "false"}
                  onValueChange={(value) => setFormData({ ...formData, vatApplicable: value === "true" })}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="true" id="vat-yes" data-testid="radio-vat-yes" />
                    <Label htmlFor="vat-yes" className="cursor-pointer font-normal">
                      Oui
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="false" id="vat-no" data-testid="radio-vat-no" />
                    <Label htmlFor="vat-no" className="cursor-pointer font-normal">
                      Non
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {calculatedHT !== null && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Montant HT (calculé)</p>
                <p className="text-lg font-semibold">{calculatedHT.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA</p>
              </div>
            )}

            {calculatedBRS && (
              <div className="bg-gray-100 border border-slate-400 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-gray-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-gray-700">
                      Retenue BRS : {calculatedBRS.brs.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA sur{" "}
                      {calculatedBRS.realTTC.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA
                    </p>
                    <p className="text-sm text-gray-600">
                      Le montant réel TTC est de {calculatedBRS.realTTC.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA.
                      Une retenue de 5% ({calculatedBRS.brs.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FCFA) sera appliquée.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-base font-medium">Type de document *</Label>
              <RadioGroup
                value={formData.invoiceType}
                onValueChange={(value) => setFormData({ ...formData, invoiceType: value as "expense" | "supplier_invoice" })}
                className="flex gap-6"
                disabled={forcedInvoiceType}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="expense" id="type-expense" data-testid="radio-type-expense" disabled={forcedInvoiceType && formData.invoiceType !== "expense"} />
                  <Label htmlFor="type-expense" className="cursor-pointer font-normal">
                    Dépense
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supplier_invoice" id="type-supplier" data-testid="radio-type-supplier" disabled={forcedInvoiceType && formData.invoiceType !== "supplier_invoice"} />
                  <Label htmlFor="type-supplier" className="cursor-pointer font-normal">
                    Facture Fournisseur
                  </Label>
                </div>
              </RadioGroup>
              {forcedInvoiceType && (
                <p className="text-xs text-muted-foreground italic">
                  {amount >= 500000
                    ? "Montant >= 500 000 FCFA : Facture Fournisseur obligatoire"
                    : selectedSupplier?.isRegularSupplier
                    ? "Fournisseur régulier : Facture Fournisseur obligatoire"
                    : formData.hasBrs
                    ? "BRS applicable : Facture Fournisseur obligatoire"
                    : isRestaurantCategory || isEssenceCategory
                    ? "Catégorie Restaurant/Essence : Dépense obligatoire"
                    : ""}
                </p>
              )}
            </div>

            {formData.invoiceType === "supplier_invoice" && (
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber" className="text-base font-medium">
                  Numéro de facture *
                </Label>
                <Input
                  id="invoiceNumber"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  placeholder="Entrez le numéro de facture"
                  className="h-14 text-base"
                  data-testid="input-invoice-number"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-medium">
                Description *
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="min-h-24 text-base resize-none"
                data-testid="textarea-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentType" className="text-base font-medium">
                Type de règlement *
              </Label>
              <Select
                value={formData.paymentType}
                onValueChange={(value) => setFormData({ ...formData, paymentType: value })}
              >
                <SelectTrigger id="paymentType" className="h-14 text-base" data-testid="select-payment-type">
                  <SelectValue placeholder="Sélectionner un type de règlement..." />
                </SelectTrigger>
                <SelectContent>
                  {isFatou ? (
                    <>
                      <SelectItem value="Wave Business Caisse">Wave Business Caisse</SelectItem>
                      <SelectItem value="Espèces">Espèces</SelectItem>
                    </>
                  ) : canUseWaveBusiness ? (
                    <>
                      <SelectItem value="Wave Business">Wave Business</SelectItem>
                      <SelectItem value="Espèces">Espèces</SelectItem>
                      <SelectItem value="Perso remboursé par Wave Business">
                        Perso remboursé par Wave Business
                      </SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="Wave Business">Wave Business</SelectItem>
                      <SelectItem value="Espèces">Espèces</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <ProjectSelect
              projects={projects}
              value={formData.projectId}
              onChange={(value) => setFormData({ ...formData, projectId: value })}
            />

            <div className="space-y-2">
              <Label htmlFor="file-upload" className="text-base font-medium">
                Remplacer la facture{" "}
                <span className="text-muted-foreground text-sm">(optionnel)</span>
              </Label>
              <div className="text-sm text-muted-foreground mb-2">
                Fichier actuel : {invoice.fileName}
              </div>
              <input
                id="file-upload"
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                data-testid="input-file-upload"
              />
              {selectedFile && (
                <p className="text-sm text-primary mt-2">Nouveau fichier : {selectedFile.name}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-14 text-base"
              disabled={updateInvoiceMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateInvoiceMutation.isPending
                ? "Modification en cours..."
                : "Enregistrer les modifications"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
