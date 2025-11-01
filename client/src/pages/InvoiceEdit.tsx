import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Pencil, AlertCircle } from "lucide-react";
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

interface Supplier {
  id: string;
  name: string;
  total?: string;
}

interface Project {
  id: string;
  number: string;
  name: string;
  startDate?: string | null;
}

interface UserData {
  id: string;
  name: string;
  token: string;
  email: string;
  driveFolderId: string;
}

interface Invoice {
  id: string;
  userName: string;
  invoiceDate: string;
  supplierId: string;
  category: string;
  amountTTC: string;
  vatApplicable: boolean;
  amountHT?: string | null;
  description?: string | null;
  paymentType: string;
  projectId?: string | null;
  fileName: string;
}

export default function InvoiceEdit() {
  const { invoiceId, userToken } = useParams();
  const urlUsername = userToken?.split('_')[0];
  const token = userToken?.split('_').slice(1).join('_');
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Validate token
  const { data: userData } = useQuery<UserData>({
    queryKey: ["/api/validate-token", token],
    enabled: !!token,
  });

  // Verify username in URL matches the token owner
  const isValidUser = userData && urlUsername && userData.name.toLowerCase() === urlUsername.toLowerCase();

  // Fetch invoice data
  const { data: invoice, isLoading: isLoadingInvoice } = useQuery<Invoice>({
    queryKey: ["/api/invoice", invoiceId],
  });

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Form state
  const [formData, setFormData] = useState<Partial<Invoice>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Initialize form data when invoice loads
  useEffect(() => {
    if (invoice) {
      setFormData({
        invoiceDate: invoice.invoiceDate.split("T")[0],
        supplierId: invoice.supplierId,
        category: invoice.category,
        amountTTC: invoice.amountTTC,
        vatApplicable: invoice.vatApplicable,
        amountHT: invoice.amountHT || "",
        description: invoice.description || "",
        paymentType: invoice.paymentType,
        projectId: invoice.projectId || "",
      });
    }
  }, [invoice]);

  // Validation en temps réel du Montant HT
  const lastToastTime = useRef<number>(0);
  useEffect(() => {
    if (formData.vatApplicable && formData.category !== "Restauration, boissons et petits achats alimentaires" && formData.amountTTC && formData.amountHT) {
      const ttc = parseFloat(formData.amountTTC);
      const ht = parseFloat(formData.amountHT);
      
      if (!isNaN(ttc) && !isNaN(ht) && ttc > 0) {
        const expectedHT = ttc / 1.18;
        const difference = Math.abs(ht - expectedHT);
        const percentDifference = (difference / expectedHT) * 100;
        
        // Si différence > 2% et pas de toast récent (éviter spam)
        const now = Date.now();
        if (percentDifference > 2 && (now - lastToastTime.current) > 3000) {
          lastToastTime.current = now;
          toast({
            title: "Vérification du montant HT",
            description: `Le montant HT renseigné (${ht.toFixed(2)} FCFA) diffère du calcul attendu (${expectedHT.toFixed(2)} FCFA). Veuillez vérifier votre saisie.`,
            variant: "default",
          });
        }
      }
    }
  }, [formData.amountHT, formData.amountTTC, formData.vatApplicable, formData.category, toast]);

  const canUseWaveBusiness = invoice?.userName === "Michael" || invoice?.userName === "Marine";

  // Calculate recent and top volume suppliers
  const recentSuppliers: Supplier[] = [];
  const topVolumeSuppliers = suppliers
    .filter((s) => s.total && parseFloat(s.total) > 0)
    .sort((a, b) => parseFloat(b.total || "0") - parseFloat(a.total || "0"))
    .slice(0, 5);

  const updateInvoiceMutation = useMutation({
    mutationFn: async () => {
      const formDataToSend = new FormData();
      formDataToSend.append("token", token || "");
      if (formData.invoiceDate) formDataToSend.append("invoiceDate", formData.invoiceDate);
      if (formData.supplierId) formDataToSend.append("supplierId", formData.supplierId);
      if (formData.category) formDataToSend.append("category", formData.category);
      if (formData.amountTTC) formDataToSend.append("amountTTC", formData.amountTTC);
      formDataToSend.append("vatApplicable", formData.vatApplicable ? "true" : "false");
      if (formData.amountHT) formDataToSend.append("amountHT", formData.amountHT);
      if (formData.description) formDataToSend.append("description", formData.description);
      if (formData.paymentType) formDataToSend.append("paymentType", formData.paymentType);
      if (formData.projectId) formDataToSend.append("projectId", formData.projectId);
      if (selectedFile) formDataToSend.append("file", selectedFile);

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
      // Invalidate both the single invoice and the user's invoice list
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
    
    // Validation: description is required
    if (!formData.description || formData.description.trim() === "") {
      toast({
        title: "Erreur",
        description: "La description est requise",
        variant: "destructive",
      });
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

  if (isLoadingInvoice || !invoice || Object.keys(formData).length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Chargement...</p>
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
          <p className="text-muted-foreground">Token d'accès invalide ou ne correspond pas au nom d'utilisateur.</p>
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
                value={formData.invoiceDate || ""}
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
                value={formData.supplierId || ""}
                onSelect={(supplierId: string) => setFormData({ ...formData, supplierId })}
                onCreateNew={async () => Promise.resolve()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="text-base font-medium">
                Catégorie *
              </Label>
              <Select
                value={formData.category || ""}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category" className="h-14 text-base" data-testid="select-category">
                  <SelectValue placeholder="Sélectionner une catégorie..." />
                </SelectTrigger>
                <SelectContent>
                  {["Restauration, boissons et petits achats alimentaires", "Essence", "Fourniture Matériaux", "Achats Prestas", "Transport de matériel", "Transport de personnes", "Hébergement", "Telephone/Internet", "Autre"].map((cat) => (
                    <SelectItem key={cat} value={cat} data-testid={`option-category-${cat}`}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground italic mt-1">
                ℹ️ La TVA n'est pas applicable sur les frais de restaurants
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amountTTC" className="text-base font-medium">
                Montant TTC (FCFA) *
              </Label>
              <Input
                id="amountTTC"
                type="number"
                step="0.01"
                value={formData.amountTTC || ""}
                onChange={(e) => setFormData({ ...formData, amountTTC: e.target.value })}
                className="h-14 text-base"
                data-testid="input-amount-ttc"
              />
            </div>

            {formData.category !== "Restauration, boissons et petits achats alimentaires" && (
              <div className="space-y-4">
                <Label className="text-base font-medium">TVA applicable</Label>
                <RadioGroup
                  value={formData.vatApplicable ? "true" : "false"}
                  onValueChange={(value) => setFormData({ ...formData, vatApplicable: value === "true" })}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="true" id="vat-yes" data-testid="radio-vat-yes" />
                    <Label htmlFor="vat-yes" className="cursor-pointer font-normal">Oui</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="false" id="vat-no" data-testid="radio-vat-no" />
                    <Label htmlFor="vat-no" className="cursor-pointer font-normal">Non</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {formData.vatApplicable && formData.category !== "Restauration, boissons et petits achats alimentaires" && (
              <div className="space-y-2">
                <Label htmlFor="amountHT" className="text-base font-medium">
                  Montant HT (FCFA) *
                </Label>
                <Input
                  id="amountHT"
                  type="number"
                  step="0.01"
                  value={formData.amountHT || ""}
                  onChange={(e) => setFormData({ ...formData, amountHT: e.target.value })}
                  className="h-14 text-base"
                  data-testid="input-amount-ht"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-medium">
                Description *
              </Label>
              <Textarea
                id="description"
                value={formData.description || ""}
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
                value={formData.paymentType || ""}
                onValueChange={(value) => setFormData({ ...formData, paymentType: value })}
              >
                <SelectTrigger id="paymentType" className="h-14 text-base" data-testid="select-payment-type">
                  <SelectValue placeholder="Sélectionner un type de règlement..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Wave" data-testid="option-payment-Wave">Wave</SelectItem>
                  <SelectItem value="Espèces" data-testid="option-payment-Espèces">Espèces</SelectItem>
                  {canUseWaveBusiness && (
                    <SelectItem value="Espèces remboursés par Wave Business" data-testid="option-payment-WaveBusiness">
                      Espèces remboursés par Wave Business
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <ProjectSelect
              projects={projects}
              value={formData.projectId || ""}
              onChange={(value) => setFormData({ ...formData, projectId: value })}
            />

            <div className="space-y-2">
              <Label htmlFor="file-upload" className="text-base font-medium">
                Remplacer la facture <span className="text-muted-foreground text-sm">(optionnel)</span>
              </Label>
              <div className="text-sm text-muted-foreground mb-2">
                Fichier actuel : {invoice.fileName}
              </div>
              <input
                id="file-upload"
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                data-testid="input-file-upload"
              />
              {selectedFile && (
                <p className="text-sm text-primary mt-2">
                  Nouveau fichier : {selectedFile.name}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-14 text-base"
              disabled={updateInvoiceMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateInvoiceMutation.isPending ? "Modification en cours..." : "Enregistrer les modifications"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
