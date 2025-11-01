import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Loader2, AlertCircle, FileText, ArrowLeft } from "lucide-react";
import { TrackingTable } from "@/components/TrackingTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Tracking() {
  const [, params] = useRoute("/tracking/:token");
  const token = params?.token;
  const { toast } = useToast();

  const { data: userData, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ["/api/validate-token", token],
    enabled: !!token,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/invoices", userData?.name],
    enabled: !!userData,
  });

  const downloadInvoiceMutation = useMutation({
    mutationFn: async (invoice: any) => {
      const response = await fetch(`/api/invoices/${invoice.id}/download`);
      if (!response.ok) throw new Error("Erreur lors du téléchargement");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = invoice.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Téléchargement réussi",
        description: "Le fichier a été téléchargé",
      });
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le fichier",
        variant: "destructive",
      });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest("DELETE", `/api/invoices/${invoiceId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", userData?.name] });
      toast({
        title: "Facture supprimée",
        description: "La facture a été supprimée avec succès",
      });
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la facture",
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

  if (userLoading || invoicesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (userError || !userData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-destructive mb-2">Accès refusé</h1>
          <p className="text-muted-foreground">Token d'accès invalide.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-6 px-4 shadow-md">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">FiltrePlante</h1>
              <p className="text-sm text-primary-foreground/90">Mes Factures</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex justify-between items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold mb-1">Mes factures</h2>
            <p className="text-muted-foreground">
              {invoices.length} facture{invoices.length !== 1 ? "s" : ""} soumise{invoices.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.href = `/submit/${token}`}
            data-testid="button-submit-new"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Nouvelle facture
          </Button>
        </div>

        <TrackingTable
          invoices={invoices}
          onDownload={downloadInvoiceMutation.mutateAsync}
          onDelete={deleteInvoiceMutation.mutateAsync}
        />
      </main>
    </div>
  );
}
