import { useState } from "react";
import { Download, Trash2, FileText, Pencil } from "lucide-react";
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

interface InvoiceWithDetails {
  id: string;
  userName: string;
  invoiceDate: string;
  supplierName: string;
  category: string;
  amountDisplayTTC: string;
  vatApplicable: boolean;
  amountHT?: string | null;
  description?: string | null;
  paymentType: string;
  projectNumber?: string;
  projectName?: string;
  fileName: string;
  driveFileId: string;
  createdAt: string;
}

interface TrackingTableProps {
  invoices: InvoiceWithDetails[];
  onDownload: (invoice: InvoiceWithDetails) => Promise<void>;
  onEdit: (invoiceId: string) => void;
  onDelete: (invoiceId: string) => Promise<void>;
}

export function TrackingTable({ invoices, onDownload, onEdit, onDelete }: TrackingTableProps) {
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
              Vous n'avez pas encore soumis de factures.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="rounded-lg border overflow-hidden">
        {/* Mobile view */}
        <div className="md:hidden divide-y">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="p-4 rounded-none border-0 border-b last:border-b-0">
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{invoice.supplierName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(invoice.invoiceDate), "d MMMM yyyy", { locale: fr })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {invoice.category}
                  </Badge>
                </div>

                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-primary">
                      {parseFloat(invoice.amountDisplayTTC).toLocaleString("fr-FR")} FCFA
                    </p>
                    {invoice.projectNumber && (
                      <p className="text-xs text-muted-foreground">
                        {invoice.projectNumber} - {invoice.projectName}
                      </p>
                    )}
                  </div>
                </div>

                {invoice.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {invoice.description}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
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
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Desktop view */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="text-primary-foreground font-semibold">Date</TableHead>
                <TableHead className="text-primary-foreground font-semibold">Fournisseur</TableHead>
                <TableHead className="text-primary-foreground font-semibold">Catégorie</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-right">
                  Montant TTC
                </TableHead>
                <TableHead className="text-primary-foreground font-semibold">Projet</TableHead>
                <TableHead className="text-primary-foreground font-semibold">Description</TableHead>
                <TableHead className="text-primary-foreground font-semibold text-center">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-muted/50" data-testid={`row-invoice-${invoice.id}`}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {format(new Date(invoice.invoiceDate), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>{invoice.supplierName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{invoice.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {parseFloat(invoice.amountDisplayTTC).toLocaleString("fr-FR")} FCFA
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {invoice.projectNumber && (
                      <div className="text-sm">
                        <p className="font-medium">{invoice.projectNumber}</p>
                        <p className="text-muted-foreground truncate">{invoice.projectName}</p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    {invoice.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {invoice.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 justify-center">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDownloadClick(invoice)}
                        disabled={loadingDownload === invoice.id}
                        data-testid={`button-download-${invoice.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onEdit(invoice.id)}
                        data-testid={`button-edit-${invoice.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDeleteClick(invoice)}
                        className="text-destructive hover:bg-destructive/10"
                        data-testid={`button-delete-${invoice.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
