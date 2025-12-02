import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CreditCard, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InvoiceWithDetails } from "./TrackingTable";

interface AddPaymentModalProps {
  invoice: InvoiceWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  userToken: string;
}

export function AddPaymentModal({
  invoice,
  open,
  onOpenChange,
  userName,
  userToken,
}: AddPaymentModalProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentType, setPaymentType] = useState("");

  const remainingAmount = invoice
    ? parseFloat(invoice.amountDisplayTTC || "0") -
      parseFloat(String(invoice.totalPaid || 0))
    : 0;

  const paymentOptions = (() => {
    const name = userName.toLowerCase();
    if (name === "fatou") {
      return [
        { value: "Wave Business Caisse", label: "Wave Business Caisse" },
        { value: "Espèces", label: "Espèces" },
      ];
    }
    return [
      { value: "Wave Business", label: "Wave Business" },
      { value: "Espèces", label: "Espèces" },
      { value: "Perso remboursé par Wave Business", label: "Perso remboursé par Wave Business" },
    ];
  })();

  const addPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error("No invoice selected");
      
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Montant invalide");
      }
      if (parsedAmount > remainingAmount) {
        throw new Error("Le montant dépasse le solde restant");
      }
      if (!paymentType) {
        throw new Error("Veuillez sélectionner un mode de paiement");
      }

      return apiRequest("POST", "/api/payments", {
        invoiceId: invoice.id,
        amountPaid: parsedAmount,
        paymentDate,
        paymentType,
        token: userToken,
      });
    },
    onSuccess: () => {
      toast({
        title: "Paiement ajouté",
        description: "Le paiement a été enregistré avec succès",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoice", invoice?.id, "with-payments"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'ajouter le paiement",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setAmount("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentType("");
  };

  const formatAmount = (num: number) => {
    return num.toLocaleString("fr-FR");
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Ajouter un paiement
          </DialogTitle>
          <DialogDescription>
            Facture {invoice.invoiceNumber || invoice.supplierName} du{" "}
            {format(new Date(invoice.invoiceDate), "d MMMM yyyy", { locale: fr })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Montant total TTC</span>
              <span className="font-medium">
                {formatAmount(parseFloat(invoice.amountDisplayTTC || "0"))} FCFA
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Déjà payé</span>
              <span className="font-medium text-green-600">
                {formatAmount(parseFloat(String(invoice.totalPaid || 0)))} FCFA
              </span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 mt-2">
              <span className="font-medium">Reste à payer</span>
              <span className="font-bold text-primary">
                {formatAmount(remainingAmount)} FCFA
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount" className="text-base font-medium">
              Montant du paiement (FCFA)
            </Label>
            <Input
              id="payment-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max: ${formatAmount(remainingAmount)}`}
              max={remainingAmount}
              className="text-lg"
              data-testid="input-payment-amount"
            />
            {amount && parseFloat(amount) > remainingAmount && (
              <p className="text-sm text-destructive">
                Le montant dépasse le solde restant
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-date" className="text-base font-medium">
              Date du paiement
            </Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="pl-10"
                data-testid="input-payment-date"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-type" className="text-base font-medium">
              Mode de paiement
            </Label>
            <Select value={paymentType} onValueChange={setPaymentType}>
              <SelectTrigger id="payment-type" data-testid="select-payment-type">
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {paymentOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            data-testid="button-cancel-payment"
          >
            Annuler
          </Button>
          <Button
            onClick={() => addPaymentMutation.mutate()}
            disabled={
              addPaymentMutation.isPending ||
              !amount ||
              parseFloat(amount) <= 0 ||
              parseFloat(amount) > remainingAmount ||
              !paymentType
            }
            className="flex-1"
            data-testid="button-confirm-payment"
          >
            {addPaymentMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              "Enregistrer"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
