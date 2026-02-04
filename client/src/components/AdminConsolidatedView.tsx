import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, Eye, Package, Receipt, CreditCard, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvoiceDetailModal } from "./InvoiceDetailModal";
import { useToast } from "@/hooks/use-toast";

interface Payment {
  id: number;
  invoiceId: string;
  amountPaid: string;
  paymentDate: string;
  paymentType: string;
  createdBy?: string | null;
  createdAt: string;
}

interface ConsolidatedInvoice {
  id: string;
  userName: string;
  invoiceDate: string;
  supplierId: string;
  supplierName: string;
  supplierIsRegular?: boolean;
  category: string;
  amountDisplayTTC: string;
  amountHT?: string | null;
  amountRealTTC?: string | null;
  vatApplicable: boolean;
  description?: string | null;
  paymentType: string;
  invoiceNumber?: string | null;
  invoiceType?: string;
  isStockPurchase?: boolean;
  hasBrs?: boolean;
  paymentStatus?: "paid" | "partial" | "unpaid" | null;
  projectId?: string | null;
  projectName?: string;
  projectNumber?: string;
  categoryId?: number | null;
  categoryAppName?: string;
  categoryAccountName?: string;
  categoryAccountCode?: string;
  fileName: string;
  driveFileId: string;
  createdAt: string;
  payments?: Payment[];
  totalPaid?: number;
  remainingAmount?: number;
}

export function AdminConsolidatedView() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");
  const [loadingDownload, setLoadingDownload] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<ConsolidatedInvoice | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const { data: invoices, isLoading, error } = useQuery<ConsolidatedInvoice[]>({
    queryKey: ["/api/admin/invoices/consolidated", selectedUser, selectedType, dateStart, dateEnd],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedUser !== "all") params.append("user", selectedUser);
      if (selectedType !== "all") params.append("type", selectedType);
      if (dateStart) params.append("date_start", dateStart);
      if (dateEnd) params.append("date_end", dateEnd);

      const response = await fetch(`/api/admin/invoices/consolidated?${params.toString()}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("adminSessionToken")}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch invoices");
      }
      
      return response.json();
    },
  });

  const handleDownload = async (invoice: ConsolidatedInvoice) => {
    setLoadingDownload(invoice.id);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/download`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("adminSessionToken")}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Download failed");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = invoice.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le fichier",
        variant: "destructive",
      });
    } finally {
      setLoadingDownload(null);
    }
  };

  const handleViewDetails = (invoice: ConsolidatedInvoice) => {
    setSelectedInvoice(invoice);
    setDetailModalOpen(true);
  };

  const formatAmount = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return num.toLocaleString("fr-FR");
  };

  const getUserBadgeColor = (userName: string) => {
    switch (userName.toLowerCase()) {
      case "michael":
        return "bg-blue-600 hover:bg-blue-600 text-white";
      case "marine":
        return "bg-purple-600 hover:bg-purple-600 text-white";
      case "fatou":
        return "bg-emerald-600 hover:bg-emerald-600 text-white";
      default:
        return "bg-gray-600 hover:bg-gray-600 text-white";
    }
  };

  const getTypeBadge = (invoice: ConsolidatedInvoice) => {
    if (invoice.invoiceType === "supplier_invoice") {
      return (
        <Badge variant="default" className="bg-blue-600 hover:bg-blue-600">
          Facture
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        Dépense
      </Badge>
    );
  };

  const getPaymentStatusBadge = (invoice: ConsolidatedInvoice) => {
    if (invoice.invoiceType !== "supplier_invoice") return null;
    
    const status = invoice.paymentStatus || "unpaid";
    switch (status) {
      case "paid":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white">
            Payé
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="default" className="bg-amber-500 hover:bg-amber-500 text-white">
            Partiel
          </Badge>
        );
      case "unpaid":
        return (
          <Badge variant="destructive">
            Impayé
          </Badge>
        );
      default:
        return null;
    }
  };

  const getIndicatorBadges = (invoice: ConsolidatedInvoice) => {
    const badges = [];
    
    if (invoice.isStockPurchase) {
      badges.push(
        <Tooltip key="stock">
          <TooltipTrigger>
            <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700">
              <Package className="h-3 w-3" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Stock</TooltipContent>
        </Tooltip>
      );
    }
    
    if (invoice.hasBrs) {
      badges.push(
        <Tooltip key="brs">
          <TooltipTrigger>
            <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-700">
              <Receipt className="h-3 w-3" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent>BRS 5%</TooltipContent>
        </Tooltip>
      );
    }
    
    return badges.length > 0 ? badges : null;
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl text-primary">
          <FileText className="h-5 w-5" />
          Vue Consolidée - Factures des 2 derniers mois
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <Label htmlFor="user-filter">Utilisateur</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger id="user-filter" className="w-[150px]" data-testid="select-user-filter">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="michael">Michael</SelectItem>
                <SelectItem value="marine">Marine</SelectItem>
                <SelectItem value="fatou">Fatou</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="type-filter">Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger id="type-filter" className="w-[180px]" data-testid="select-type-filter">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="expense">Dépense</SelectItem>
                <SelectItem value="supplier_invoice">Facture Fournisseur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="date-start">Date début</Label>
            <Input
              type="date"
              id="date-start"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-[160px]"
              data-testid="input-date-start"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="date-end">Date fin</Label>
            <Input
              type="date"
              id="date-end"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-[160px]"
              data-testid="input-date-end"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            Erreur lors du chargement des factures
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucune facture pour cette période
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10">
                  <TableHead className="font-semibold">User</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Fournisseur</TableHead>
                  <TableHead className="font-semibold">Catégorie</TableHead>
                  <TableHead className="font-semibold text-right">Montant TTC</TableHead>
                  <TableHead className="font-semibold text-right">Montant HT</TableHead>
                  <TableHead className="font-semibold text-right">Brut BRS</TableHead>
                  <TableHead className="font-semibold">N° Facture</TableHead>
                  <TableHead className="font-semibold">Paiement</TableHead>
                  <TableHead className="font-semibold">Indicateurs</TableHead>
                  <TableHead className="font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/50">
                    <TableCell>
                      <Badge className={getUserBadgeColor(invoice.userName)}>
                        {invoice.userName}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(invoice.invoiceDate), "dd/MM/yyyy", { locale: fr })}
                    </TableCell>
                    <TableCell>{getTypeBadge(invoice)}</TableCell>
                    <TableCell className="max-w-[150px] truncate" title={invoice.supplierName}>
                      {invoice.supplierName}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate" title={invoice.categoryAppName || invoice.category}>
                      {invoice.categoryAppName || invoice.category}
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">
                      {formatAmount(invoice.amountDisplayTTC)} F
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {invoice.vatApplicable && invoice.amountHT
                        ? `${formatAmount(invoice.amountHT)} F`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {invoice.hasBrs && invoice.amountRealTTC
                        ? `${formatAmount(invoice.amountRealTTC)} F`
                        : "-"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {invoice.invoiceNumber || "-"}
                    </TableCell>
                    <TableCell className="text-sm">{invoice.paymentType}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 items-center">
                        {getPaymentStatusBadge(invoice)}
                        {getIndicatorBadges(invoice)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewDetails(invoice)}
                              data-testid={`button-view-${invoice.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Voir détails</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(invoice)}
                              disabled={loadingDownload === invoice.id || !invoice.driveFileId}
                              data-testid={`button-download-${invoice.id}`}
                            >
                              {loadingDownload === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {!invoice.driveFileId ? "Fichier non disponible" : "Télécharger"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <div className="mt-4 text-sm text-muted-foreground">
              {invoices.length} facture{invoices.length > 1 ? "s" : ""} affichée{invoices.length > 1 ? "s" : ""}
            </div>
          </div>
        )}

        {selectedInvoice && (
          <InvoiceDetailModal
            invoice={selectedInvoice as any}
            open={detailModalOpen}
            onOpenChange={(open) => {
              setDetailModalOpen(open);
              if (!open) setSelectedInvoice(null);
            }}
            onDownload={handleDownload as any}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        )}
      </CardContent>
    </Card>
  );
}
