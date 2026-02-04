import { useState } from "react";
import { Download, Trash2, FileText, Pencil, Eye, Package, Receipt, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface Payment {
  id: number;
  invoiceId: string;
  amountPaid: string;
  paymentDate: string;
  paymentType: string;
  createdBy?: string | null;
  createdAt: string;
}

export interface InvoiceWithDetails {
  id: string;
  userName: string;
  invoiceDate: string;
  supplierId: string;
  supplierName: string;
  supplierIsRegular?: boolean;
  category: string;
  amountDisplayTTC: string;
  vatApplicable: boolean;
  amountHT?: string | null;
  amountRealTTC?: string | null;
  description?: string | null;
  paymentType: string;
  projectId?: string | null;
  projectNumber?: string;
  projectName?: string;
  fileName: string;
  driveFileId: string;
  createdAt: string;
  invoiceType?: string;
  invoiceNumber?: string | null;
  isStockPurchase?: boolean;
  categoryId?: number | null;
  hasBrs?: boolean;
  categoryAppName?: string;
  categoryAccountName?: string;
  categoryAccountCode?: string;
  displayCategory?: string;
  displayAmount?: string;
  paymentStatus?: "paid" | "partial" | "unpaid" | null;
  totalPaid?: number;
  remainingAmount?: number;
  payments?: Payment[];
}

interface TrackingTableProps {
  invoices: InvoiceWithDetails[];
  onDownload: (invoice: InvoiceWithDetails) => Promise<void>;
  onEdit: (invoiceId: string) => void;
  onDelete: (invoiceId: string) => Promise<void>;
  onViewDetails: (invoice: InvoiceWithDetails) => void;
  onAddPayment?: (invoice: InvoiceWithDetails) => void;
}

export function TrackingTable({ invoices, onDownload, onEdit, onDelete, onViewDetails, onAddPayment }: TrackingTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithDetails | null>(null);
  const [loadingDownload, setLoadingDownload] = useState<string | null>(null);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const handleDownloadClick = async (invoice: InvoiceWithDetails) => {
    setLoadingDownload(invoice.id);
    try {
      await onDownload(invoice);
    } finally {
      setLoadingDownload(null);
    }
  };

  const handleDeleteClick = (invoice: InvoiceWithDetails) => {
    setSelectedInvoice(invoice);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedInvoice) return;

    setLoadingDelete(true);
    try {
      await onDelete(selectedInvoice.id);
      setDeleteDialogOpen(false);
      setSelectedInvoice(null);
    } finally {
      setLoadingDelete(false);
    }
  };

  const formatAmount = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return num.toLocaleString("fr-FR");
  };

  const getTypeBadge = (invoice: InvoiceWithDetails) => {
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

  const getIndicatorBadges = (invoice: InvoiceWithDetails) => {
    const badges = [];
    
    if (invoice.isStockPurchase) {
      badges.push(
        <Tooltip key="stock">
          <TooltipTrigger>
            <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700">
              <Package className="h-3 w-3" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Achat pour le stock</TooltipContent>
        </Tooltip>
      );
    }
    
    if (invoice.hasBrs) {
      badges.push(
        <Tooltip key="brs">
          <TooltipTrigger>
            <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-700">
              <Receipt className="h-3 w-3" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Retenue BRS appliquée</TooltipContent>
        </Tooltip>
      );
    }
    
    return badges;
  };

  const getPaymentStatusBadge = (invoice: InvoiceWithDetails) => {
    if (invoice.invoiceType !== "supplier_invoice") return null;
    
    const status = invoice.paymentStatus;
    
    if (status === "paid") {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="bg-green-50 border-green-300 text-green-700">
              Soldé
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Facture entièrement payée</TooltipContent>
        </Tooltip>
      );
    }
    
    if (status === "partial") {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-700">
              Partiel
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Payé: {formatAmount(invoice.totalPaid || 0)} / Reste: {formatAmount(invoice.remainingAmount || 0)} FCFA
          </TooltipContent>
        </Tooltip>
      );
    }
    
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="bg-red-50 border-red-300 text-red-700">
            Non payé
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Aucun paiement enregistré</TooltipContent>
      </Tooltip>
    );
  };

  if (invoices.length === 0) {
    return (
      <Card className="p-12 bg-muted/30">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-6">
              <FileText className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Aucune facture</h3>
            <p className="text-muted-foreground">
              Aucune facture ne correspond à vos critères de recherche.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="rounded-lg border overflow-hidden">
        <div className="md:hidden divide-y">
          {invoices.map((invoice) => (
            <Card 
              key={invoice.id} 
              className="p-4 rounded-none border-0 border-b last:border-b-0 cursor-pointer hover-elevate"
              onClick={() => onViewDetails(invoice)}
              data-testid={`card-invoice-${invoice.id}`}
            >
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{invoice.supplierName}</p>
                      {getIndicatorBadges(invoice)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(invoice.invoiceDate), "d MMMM yyyy", { locale: fr })}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {getTypeBadge(invoice)}
                    {getPaymentStatusBadge(invoice)}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-primary">
                      {formatAmount(invoice.amountDisplayTTC)} FCFA
                    </p>
                    {invoice.vatApplicable && invoice.amountHT && (
                      <p className="text-xs text-muted-foreground">
                        HT: {formatAmount(invoice.amountHT)} FCFA
                      </p>
                    )}
                    {invoice.invoiceType === "supplier_invoice" && invoice.paymentStatus === "partial" && (
                      <p className="text-xs text-orange-600">
                        Reste: {formatAmount(invoice.remainingAmount || 0)} FCFA
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {invoice.displayCategory || invoice.categoryAppName || invoice.category}
                  </Badge>
                </div>

                {invoice.invoiceNumber && (
                  <p className="text-xs text-muted-foreground">
                    N° Facture: {invoice.invoiceNumber}
                  </p>
                )}

                {invoice.projectNumber && (
                  <p className="text-xs text-muted-foreground">
                    {invoice.projectNumber} - {invoice.projectName}
                  </p>
                )}

                {invoice.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {invoice.description}
                  </p>
                )}

                <div className="flex gap-2 pt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadClick(invoice)}
                    disabled={loadingDownload === invoice.id}
                    className="flex-1"
                    data-testid={`button-download-${invoice.id}`}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {loadingDownload === invoice.id ? "..." : "Télécharger"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(invoice.id)}
                    className="flex-1"
                    data-testid={`button-edit-${invoice.id}`}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteClick(invoice)}
                    className="flex-1 text-destructive hover:bg-destructive/10"
                    data-testid={`button-delete-${invoice.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer
                  </Button>
                  {invoice.invoiceType === "supplier_invoice" && 
                   invoice.paymentStatus !== "paid" && 
                   onAddPayment && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAddPayment(invoice)}
                      className="flex-1 text-teal-600 border-teal-600 hover:bg-teal-50"
                      data-testid={`button-add-payment-mobile-${invoice.id}`}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Payer
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground font-semibold">Date</TableHead>
                <TableHead className="text-primary-foreground font-semibold">Type</TableHead>
                <TableHead className="text-primary-foreground font-semibold">Fournisseur</TableHead>
                <TableHead className="text-primary-foreground font-semibold">Catégorie</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Montant TTC
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Montant HT
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Brut BRS
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold">N° Facture</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-center">
                  Paiement
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-center">
                  Indicateurs
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold text-center">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow 
                  key={invoice.id} 
                  className="hover:bg-muted/50 cursor-pointer" 
                  data-testid={`row-invoice-${invoice.id}`}
                  onClick={() => onViewDetails(invoice)}
                >
                  <TableCell className="font-medium whitespace-nowrap">
                    {format(new Date(invoice.invoiceDate), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>{getTypeBadge(invoice)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {invoice.supplierName}
                      {invoice.supplierIsRegular && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="ml-1 text-xs">R</Badge>
                          </TooltipTrigger>
                          <TooltipContent>Fournisseur régulier</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="max-w-[150px] truncate">
                      {invoice.displayCategory || invoice.categoryAppName || invoice.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatAmount(invoice.amountDisplayTTC)} FCFA
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {invoice.vatApplicable && invoice.amountHT
                      ? `${formatAmount(invoice.amountHT)} FCFA`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {invoice.hasBrs && invoice.amountRealTTC
                      ? `${formatAmount(invoice.amountRealTTC)} FCFA`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.invoiceNumber || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      {getPaymentStatusBadge(invoice) || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      {getIndicatorBadges(invoice)}
                      {getIndicatorBadges(invoice).length === 0 && (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onViewDetails(invoice)}
                            data-testid={`button-view-${invoice.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Voir les détails</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadClick(invoice)}
                            disabled={loadingDownload === invoice.id}
                            data-testid={`button-download-${invoice.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Télécharger</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(invoice.id)}
                            data-testid={`button-edit-${invoice.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifier</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(invoice)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-${invoice.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Supprimer</TooltipContent>
                      </Tooltip>
                      {invoice.invoiceType === "supplier_invoice" && 
                       invoice.paymentStatus !== "paid" && 
                       onAddPayment && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => onAddPayment(invoice)}
                              className="text-teal-600 border-teal-600 hover:bg-teal-50"
                              data-testid={`button-add-payment-${invoice.id}`}
                            >
                              <CreditCard className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ajouter un paiement</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la facture ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La facture sera supprimée de la base de données et de
              Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={loadingDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {loadingDelete ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
