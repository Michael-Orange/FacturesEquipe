import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Card } from "@/components/ui/card";
import { SupplierSearch } from "./SupplierSearch";
import { ProjectSelect } from "./ProjectSelect";
import { useToast } from "@/hooks/use-toast";

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
  category: z.string().min(1, "La catégorie est requise"),
  amountTTC: z.string().min(1, "Le montant TTC est requis"),
  vatApplicable: z.enum(["true", "false"]),
  amountHT: z.string().optional(),
  description: z.string().min(1, "La description est requise"),
  paymentType: z.string().min(1, "Le type de règlement est requis"),
  projectId: z.string().optional(),
}).refine(
  (data) => {
    // Montant HT requis si TVA = Oui ET catégorie != Restauration
    if (data.vatApplicable === "true" && data.category !== "Restauration, boissons et petits achats alimentaires" && (!data.amountHT || data.amountHT.trim() === "")) {
      return false;
    }
    return true;
  },
  {
    message: "Le montant HT est requis quand la TVA est applicable",
    path: ["amountHT"],
  }
);

export type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

const CATEGORIES = [
  "Restauration, boissons et petits achats alimentaires",
  "Essence",
  "Fourniture Matériaux",
  "Achats Prestas",
  "Transport de matériel",
  "Transport de personnes",
  "Hébergement",
  "Telephone/Internet",
  "Autre",
];

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

  const canUseWaveBusiness = userName === "Michael" || userName === "Marine";

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceDate: new Date().toISOString().split("T")[0],
      supplierId: "",
      category: "",
      amountTTC: "",
      vatApplicable: "false",
      amountHT: "",
      description: "",
      paymentType: "",
      projectId: "",
    },
  });

  const category = form.watch("category");
  const vatApplicable = form.watch("vatApplicable");
  const supplierId = form.watch("supplierId");
  const amountTTC = form.watch("amountTTC");
  const amountHT = form.watch("amountHT");

  // Validation en temps réel du Montant HT
  useEffect(() => {
    if (vatApplicable === "true" && category !== "Restauration, boissons et petits achats alimentaires" && amountTTC && amountHT) {
      const ttc = parseFloat(amountTTC);
      const ht = parseFloat(amountHT);
      
      if (!isNaN(ttc) && !isNaN(ht) && ttc > 0) {
        const expectedHT = ttc / 1.18;
        const difference = Math.abs(ht - expectedHT);
        const percentDifference = (difference / expectedHT) * 100;
        
        // Si différence > 2%, afficher un avertissement
        if (percentDifference > 2) {
          toast({
            title: "Vérification du montant HT",
            description: `Le montant HT renseigné (${ht.toFixed(2)} FCFA) diffère du calcul attendu (${expectedHT.toFixed(2)} FCFA). Veuillez vérifier votre saisie.`,
            variant: "default",
          });
        }
      }
    }
  }, [amountHT, amountTTC, vatApplicable, category, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Accept all image types (including HEIC/HEIF from iPhone) and PDFs
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
      await onSubmit({ ...data, file: selectedFile });
      setIsSuccess(true);
      form.reset({
        invoiceDate: new Date().toISOString().split("T")[0],
        supplierId: "",
        category: "",
        amountTTC: "",
        vatApplicable: "false",
        amountHT: "",
        description: "",
        paymentType: "",
        projectId: "",
      });
      setSelectedFile(null);
      
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
        <Label htmlFor="invoiceDate" className="text-base font-medium">
          Date de la facture
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

      <div className="space-y-2">
        <Label className="text-base font-medium">Fournisseur *</Label>
        <SupplierSearch
          suppliers={suppliers}
          recentSuppliers={recentSuppliers}
          topVolumeSuppliers={topVolumeSuppliers}
          value={supplierId}
          onSelect={(id) => form.setValue("supplierId", id)}
          onCreateNew={onCreateSupplier}
        />
        {form.formState.errors.supplierId && (
          <p className="text-sm text-destructive">{form.formState.errors.supplierId.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="category" className="text-base font-medium">
          Catégorie *
        </Label>
        <Select value={category} onValueChange={(value) => form.setValue("category", value)}>
          <SelectTrigger id="category" className="h-14 text-base" data-testid="select-category">
            <SelectValue placeholder="Sélectionner une catégorie..." />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat} data-testid={`option-category-${cat}`}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.category && (
          <p className="text-sm text-destructive">{form.formState.errors.category.message}</p>
        )}
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
          placeholder="0.00"
          {...form.register("amountTTC")}
          className="h-14 text-base"
          data-testid="input-amount-ttc"
        />
        {form.formState.errors.amountTTC && (
          <p className="text-sm text-destructive">{form.formState.errors.amountTTC.message}</p>
        )}
      </div>

      {category !== "Restauration, boissons et petits achats alimentaires" && (
        <div className="space-y-4">
          <Label className="text-base font-medium">TVA applicable</Label>
          <RadioGroup
            value={vatApplicable}
            onValueChange={(value) => form.setValue("vatApplicable", value as "true" | "false")}
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

      {vatApplicable === "true" && category !== "Restauration, boissons et petits achats alimentaires" && (
        <div className="space-y-2">
          <Label htmlFor="amountHT" className="text-base font-medium">
            Montant HT (FCFA) *
          </Label>
          <Input
            id="amountHT"
            type="number"
            step="0.01"
            placeholder="0.00"
            {...form.register("amountHT")}
            className="h-14 text-base"
            data-testid="input-amount-ht"
          />
          {form.formState.errors.amountHT && (
            <p className="text-sm text-destructive">{form.formState.errors.amountHT.message}</p>
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
            <SelectItem value="Wave" data-testid="option-payment-Wave">Wave</SelectItem>
            <SelectItem value="Espèces" data-testid="option-payment-Espèces">Espèces</SelectItem>
            {canUseWaveBusiness && (
              <SelectItem value="Espèces remboursés par Wave Business" data-testid="option-payment-WaveBusiness">
                Espèces remboursés par Wave Business
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {form.formState.errors.paymentType && (
          <p className="text-sm text-destructive">{form.formState.errors.paymentType.message}</p>
        )}
      </div>

      <ProjectSelect
        projects={projects}
        value={form.watch("projectId") || ""}
        onChange={(value) => form.setValue("projectId", value)}
      />

      <div className="space-y-2">
        <Label htmlFor="file-upload" className="text-base font-medium">
          Facture (PDF ou Image) *
        </Label>
        <div className="relative">
          <input
            id="file-upload"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
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
