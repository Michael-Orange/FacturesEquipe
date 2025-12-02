import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, Pencil, Trash2, X, Package, Receipt, Info, Plus, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { InvoiceWithDetails } from "./TrackingTable";

interface Payment {
  id: number;
  invoiceId: string;
  amountPaid: string;
  paymentDate: string;
  paymentType: string;
  createdBy?: string | null;
  createdAt: string;
}

interface InvoiceDetailModalProps {
  invoice: InvoiceWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (invoice: InvoiceWithDetails) => Promise<void>;
  onEdit: (invoiceId: string) => void;
  onDelete: (invoiceId: string) => void;
  onAddPayment?: (invoice: InvoiceWithDetails) => void;
  loadingDownload?: boolean;
  payments?: Payment[];
}

export function InvoiceDetailModal({
  invoice,
  open,
  onOpenChange,
  onDownload,
  onEdit,
  onDelete,
  onAddPayment,
  loadingDownload = false,
  payments = [],
}: InvoiceDetailModalProps) {
  if (!invoice) return null;

  const isSupplierInvoice = invoice.invoiceType === "supplier_invoice";
  const canAddPayment = isSupplierInvoice && invoice.paymentStatus !== "paid";

  const formatAmount = (amount: string | number | null | undefined) => {
    if (!amount) return "-";
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return `${num.toLocaleString("fr-FR")} FCFA`;
  };

  const handleDownload = async () => {
    await onDownload(invoice);
  };

  const handleEdit = () => {
    onOpenChange(false);
    onEdit(invoice.id);
  };

  const handleDelete = () => {
    onOpenChange(false);
    onDelete(invoice.id);
  };

  const calculateBrsAmount = () => {
    if (!invoice.hasBrs || !invoice.amountDisplayTTC) return null;
    const displayTTC = parseFloat(invoice.amountDisplayTTC);
    const realTTC = displayTTC / 0.95;
    const brsAmount = realTTC * 0.05;
    return { realTTC, brsAmount };
  };

  const brsCalculation = calculateBrsAmount();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Détails de la facture</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-6 w-6"
              data-testid="button-close-modal"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {invoice.invoiceType === "supplier_invoice" ? (
                <Badge variant="default" className="bg-blue-600 hover:bg-blue-600">
                  Facture Fournisseur
                </Badge>
              ) : (
                <Badge variant="secondary">Dépense</Badge>
              )}
              {invoice.isStockPurchase && (
                <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700">
                  <Package className="h-3 w-3 mr-1" />
                  Stock
                </Badge>
              )}
              {invoice.hasBrs && (
                <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-700">
                  <Receipt className="h-3 w-3 mr-1" />
                  BRS
                </Badge>
              )}
              {isSupplierInvoice && invoice.paymentStatus === "paid" && (
                <Badge variant="outline" className="bg-green-50 border-green-300 text-green-700">
                  Soldé
                </Badge>
              )}
              {isSupplierInvoice && invoice.paymentStatus === "partial" && (
                <Badge variant="outline" className="bg-orange-50 border-orange-300 text-orange-700">
                  Partiel
                </Badge>
              )}
              {isSupplierInvoice && invoice.paymentStatus === "unpaid" && (
                <Badge variant="outline" className="bg-red-50 border-red-300 text-red-700">
                  Non payé
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {format(new Date(invoice.invoiceDate), "d MMMM yyyy", { locale: fr })}
            </span>
          </div>

          <Separator />

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fournisseur</p>
                <p className="font-medium">
                  {invoice.supplierName}
                  {invoice.supplierIsRegular && (
                    <Badge variant="outline" className="ml-2 text-xs">Régulier</Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Catégorie</p>
                <Badge variant="secondary">
                  {invoice.displayCategory || invoice.categoryAppName || invoice.category}
                </Badge>
              </div>
            </div>

            {invoice.invoiceNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Numéro de facture</p>
                <p className="font-medium">{invoice.invoiceNumber}</p>
              </div>
            )}

            <Separator />

            <div>
              <p className="text-xs text-muted-foreground mb-2">Montants</p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span>Montant TTC</span>
                  <span className="font-bold text-lg text-primary">
                    {formatAmount(invoice.amountDisplayTTC)}
                  </span>
                </div>
                
                {invoice.vatApplicable && invoice.amountHT && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Montant HT (calculé)</span>
                    <span>{formatAmount(invoice.amountHT)}</span>
                  </div>
                )}

                {invoice.vatApplicable && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">TVA (18%)</span>
                    <span>Applicable</span>
                  </div>
                )}
              </div>
            </div>

            {brsCalculation && (
              <div className="bg-gray-100 border border-slate-400 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-gray-500 mt-0.5 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <p className="font-medium text-gray-700">Retenue BRS appliquée</p>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Montant réel TTC</span>
                        <span className="font-medium">{formatAmount(brsCalculation.realTTC)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Retenue BRS (5%)</span>
                        <span className="font-medium text-purple-700">
                          {formatAmount(brsCalculation.brsAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-300 pt-1 mt-1">
                        <span className="text-gray-600">Montant perçu</span>
                        <span className="font-medium">{formatAmount(invoice.amountDisplayTTC)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isSupplierInvoice && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      Paiements
                    </p>
                    {canAddPayment && onAddPayment && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAddPayment(invoice)}
                        data-testid="button-add-payment"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Ajouter
                      </Button>
                    )}
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span>Montant total</span>
                      <span className="font-medium">
                        {formatAmount(invoice.amountDisplayTTC)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span>Total payé</span>
                      <span className="font-medium text-green-600">
                        {formatAmount(invoice.totalPaid || 0)}
                      </span>
                    </div>
                    {invoice.remainingAmount && parseFloat(String(invoice.remainingAmount)) > 0 && (
                      <div className="flex justify-between items-center text-sm border-t pt-2">
                        <span className="font-medium">Reste à payer</span>
                        <span className="font-bold text-orange-600">
                          {formatAmount(invoice.remainingAmount)}
                        </span>
                      </div>
                    )}
                  </div>

                  {payments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-muted-foreground">Historique</p>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {payments.map((payment, index) => (
                          <div
                            key={payment.id}
                            className="flex justify-between items-center bg-muted/30 rounded p-2 text-sm"
                            data-testid={`payment-row-${index}`}
                          >
                            <div>
                              <span className="text-muted-foreground">
                                {format(new Date(payment.paymentDate), "dd/MM/yyyy")}
                              </span>
                              <span className="mx-2">•</span>
                              <span className="text-xs">{payment.paymentType}</span>
                            </div>
                            <span className="font-medium text-green-600">
                              {formatAmount(payment.amountPaid)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {payments.length === 0 && invoice.paymentStatus === "unpaid" && (
                    <p className="text-sm text-muted-foreground text-center py-2 mt-2">
                      Aucun paiement enregistré
                    </p>
                  )}
                </div>
              </>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Mode de paiement</p>
                <p className="font-medium">{invoice.paymentType}</p>
              </div>
              {invoice.projectNumber && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Projet</p>
                  <p className="font-medium text-sm">
                    {invoice.projectNumber}
                    <span className="text-muted-foreground block text-xs">
                      {invoice.projectName}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {invoice.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm bg-muted/30 p-3 rounded-lg">{invoice.description}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-1">Fichier</p>
              <p className="text-sm font-mono bg-muted/30 p-2 rounded truncate">
                {invoice.fileName}
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={loadingDownload}
              className="flex-1"
              data-testid="button-modal-download"
            >
              <Download className="h-4 w-4 mr-2" />
              {loadingDownload ? "Téléchargement..." : "Télécharger"}
            </Button>
            <Button
              variant="outline"
              onClick={handleEdit}
              className="flex-1"
              data-testid="button-modal-edit"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Modifier
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-destructive hover:bg-destructive/10"
              data-testid="button-modal-delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
