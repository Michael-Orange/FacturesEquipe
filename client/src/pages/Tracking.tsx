import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Loader2, AlertCircle, FileText, ArrowLeft, Download } from "lucide-react";
import { TrackingTable, type InvoiceWithDetails } from "@/components/TrackingTable";
import { TrackingFilters, type InvoiceFilters } from "@/components/TrackingFilters";
import { InvoiceDetailModal } from "@/components/InvoiceDetailModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Category, UserToken } from "@shared/schema";

export default function Tracking() {
  const [, params] = useRoute("/tracking/:userToken");
  const [, setLocation] = useLocation();
  const userToken = params?.userToken;
  const urlUsername = userToken?.split('_')[0];
  const token = userToken?.split('_').slice(1).join('_');
  const { toast } = useToast();

  const [filters, setFilters] = useState<InvoiceFilters>({
    type: "all",
    categoryId: "all",
    hasBrs: false,
    isStockPurchase: false,
    paymentStatus: "all",
    sortBy: "date",
    sortOrder: "desc",
  });

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithDetails | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);

  const { data: userData, isLoading: userLoading, error: userError } = useQuery<UserToken>({
    queryKey: ["/api/validate-token", token],
    enabled: !!token,
  });

  const isValidUser = userData && urlUsername && userData.name.toLowerCase() === urlUsername.toLowerCase();

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!userData,
  });

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filters.type !== "all") params.append("type", filters.type);
    if (filters.categoryId !== "all") params.append("category_id", filters.categoryId);
    if (filters.hasBrs) params.append("has_brs", "true");
    if (filters.isStockPurchase) params.append("is_stock_purchase", "true");
    if (filters.paymentStatus !== "all") params.append("payment_status", filters.paymentStatus);
    if (filters.sortBy !== "date") params.append("sort_by", filters.sortBy);
    if (filters.sortOrder !== "desc") params.append("sort_order", filters.sortOrder);
    return params.toString();
  };

  const queryParams = buildQueryParams();
  const invoicesQueryKey = queryParams 
    ? `/api/invoices/${userData?.name}?${queryParams}`
    : `/api/invoices/${userData?.name}`;

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<InvoiceWithDetails[]>({
    queryKey: ["/api/invoices", userData?.name, filters],
    queryFn: async () => {
      const response = await fetch(invoicesQueryKey);
      if (!response.ok) throw new Error("Failed to fetch invoices");
      return response.json();
    },
    enabled: !!userData,
  });

  const downloadInvoiceMutation = useMutation({
    mutationFn: async (invoice: InvoiceWithDetails) => {
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

  const exportCSVMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/invoices/${userData?.name}/export-csv?token=${token}`);
      if (!response.ok) throw new Error("Erreur lors de l'export");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mes_factures_${userData?.name.toLowerCase()}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Export réussi",
        description: "Vos factures ont été exportées en CSV",
      });
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les factures",
        variant: "destructive",
      });
    },
  });

  const handleViewDetails = (invoice: InvoiceWithDetails) => {
    setSelectedInvoice(invoice);
    setDetailModalOpen(true);
  };

  const handleModalDownload = async (invoice: InvoiceWithDetails) => {
    setLoadingDownload(true);
    try {
      await downloadInvoiceMutation.mutateAsync(invoice);
    } finally {
      setLoadingDownload(false);
    }
  };

  const handleModalDelete = (invoiceId: string) => {
    deleteInvoiceMutation.mutate(invoiceId);
  };

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
              {invoices.length} facture{invoices.length !== 1 ? "s" : ""} affichée{invoices.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => exportCSVMutation.mutate()}
              disabled={exportCSVMutation.isPending || invoices.length === 0}
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4 mr-2" />
              {exportCSVMutation.isPending ? "Export..." : "Exporter CSV"}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = `/${userToken}`}
              data-testid="button-submit-new"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Nouvelle facture
            </Button>
          </div>
        </div>

        <TrackingFilters
          filters={filters}
          categories={categories}
          onFiltersChange={setFilters}
        />

        <TrackingTable
          invoices={invoices}
          onDownload={downloadInvoiceMutation.mutateAsync}
          onEdit={(invoiceId) => setLocation(`/edit/${invoiceId}/${userToken}`)}
          onDelete={deleteInvoiceMutation.mutateAsync}
          onViewDetails={handleViewDetails}
        />
      </main>

      <InvoiceDetailModal
        invoice={selectedInvoice}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onDownload={handleModalDownload}
        onEdit={(invoiceId) => setLocation(`/edit/${invoiceId}/${userToken}`)}
        onDelete={handleModalDelete}
        loadingDownload={loadingDownload}
      />
    </div>
  );
}
