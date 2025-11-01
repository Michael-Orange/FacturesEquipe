import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Loader2, AlertCircle, FileText } from "lucide-react";
import { InvoiceForm, type InvoiceFormData } from "@/components/InvoiceForm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function InvoiceSubmission() {
  const [, params] = useRoute("/:userToken");
  const userToken = params?.userToken;
  const urlUsername = userToken?.split('_')[0];
  const token = userToken?.split('_').slice(1).join('_');
  const { toast } = useToast();

  const { data: userData, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ["/api/validate-token", token],
    enabled: !!token,
  });

  // Verify username in URL matches the token owner
  const isValidUser = userData && urlUsername && userData.name.toLowerCase() === urlUsername.toLowerCase();

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["/api/suppliers"],
    enabled: !!userData,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    enabled: !!userData,
  });

  const { data: recentSuppliers = [] } = useQuery({
    queryKey: ["/api/suppliers/recent", userData?.name],
    enabled: !!userData,
  });

  const { data: topVolumeSuppliers = [] } = useQuery({
    queryKey: ["/api/suppliers/top-volume"],
    enabled: !!userData,
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiRequest("POST", "/api/suppliers", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({
        title: "Fournisseur créé",
        description: "Le nouveau fournisseur a été ajouté avec succès",
      });
    },
  });

  const submitInvoiceMutation = useMutation({
    mutationFn: async (data: InvoiceFormData & { file: File }) => {
      const formData = new FormData();
      formData.append("userName", userData.name);
      formData.append("token", token!);
      formData.append("invoiceDate", data.invoiceDate);
      formData.append("supplierId", data.supplierId);
      formData.append("category", data.category);
      formData.append("amountTTC", data.amountTTC);
      formData.append("vatApplicable", data.vatApplicable);
      if (data.amountHT) formData.append("amountHT", data.amountHT);
      if (data.description) formData.append("description", data.description);
      formData.append("paymentType", data.paymentType);
      if (data.projectId) formData.append("projectId", data.projectId);
      formData.append("file", data.file);

      const response = await fetch("/api/invoices", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erreur lors de la soumission");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Facture soumise",
        description: "Un email de confirmation a été envoyé",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-destructive mb-2">Accès refusé</h1>
          <p className="text-muted-foreground">Token d'accès invalide ou manquant.</p>
        </Card>
      </div>
    );
  }

  if (userLoading || suppliersLoading || projectsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (userError || !userData || !isValidUser) {
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
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">FiltrePlante</h1>
              <p className="text-sm text-primary-foreground/90">Soumission de Factures</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">Bonjour {userData.name}</h2>
          <p className="text-muted-foreground">Soumettez vos factures facilement</p>
        </div>

        <div className="space-y-6">
          <Card className="p-6 md:p-8">
            <InvoiceForm
              userName={userData.name}
              suppliers={suppliers}
              recentSuppliers={recentSuppliers}
              topVolumeSuppliers={topVolumeSuppliers}
              projects={projects}
              onSubmit={submitInvoiceMutation.mutateAsync}
              onCreateSupplier={createSupplierMutation.mutateAsync}
            />
          </Card>

          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => window.location.href = `/tracking/${userToken}`}
              data-testid="button-view-tracking"
            >
              Voir mes factures
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
