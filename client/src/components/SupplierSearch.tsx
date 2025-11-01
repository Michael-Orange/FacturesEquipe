import { useState, useEffect, useMemo } from "react";
import { Search, Plus, AlertTriangle, X } from "lucide-react";
import Fuse from "fuse.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Supplier {
  id: string;
  name: string;
  total?: string;
}

interface SupplierSearchProps {
  suppliers: Supplier[];
  recentSuppliers: Supplier[];
  topVolumeSuppliers: Supplier[];
  value: string;
  onSelect: (supplierId: string, supplierName: string) => void;
  onCreateNew: (name: string) => Promise<void>;
}

export function SupplierSearch({
  suppliers,
  recentSuppliers,
  topVolumeSuppliers,
  value,
  onSelect,
  onCreateNew,
}: SupplierSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [similarSupplier, setSimilarSupplier] = useState<Supplier | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fuse = useMemo(
    () =>
      new Fuse(suppliers, {
        keys: ["name"],
        threshold: 0.3,
        includeScore: true,
      }),
    [suppliers]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return fuse.search(searchQuery).slice(0, 10).map((result) => result.item);
  }, [searchQuery, fuse]);

  const selectedSupplier = suppliers.find((s) => s.id === value);

  useEffect(() => {
    if (selectedSupplier) {
      setSearchQuery(selectedSupplier.name);
    }
  }, [selectedSupplier]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setShowSuggestions(true);
  };

  const handleSelectSupplier = (supplier: Supplier) => {
    onSelect(supplier.id, supplier.name);
    setSearchQuery(supplier.name);
    setShowSuggestions(false);
  };

  const handleNewSupplier = () => {
    setNewSupplierName("");
    setSimilarSupplier(null);
    setShowNewSupplierDialog(true);
  };

  const checkSimilarity = (name: string) => {
    if (!name.trim()) {
      setSimilarSupplier(null);
      return;
    }

    const results = fuse.search(name);
    if (results.length > 0 && results[0].score! < 0.4) {
      setSimilarSupplier(results[0].item);
    } else {
      setSimilarSupplier(null);
    }
  };

  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return;

    setIsCreating(true);
    try {
      await onCreateNew(newSupplierName.trim());
      setShowNewSupplierDialog(false);
      setNewSupplierName("");
      setSimilarSupplier(null);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUseSimilar = () => {
    if (similarSupplier) {
      handleSelectSupplier(similarSupplier);
      setShowNewSupplierDialog(false);
      setNewSupplierName("");
      setSimilarSupplier(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            data-testid="input-supplier-search"
            type="text"
            placeholder="Rechercher un fournisseur..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            className="pl-10 pr-10 h-14 text-base rounded-full bg-background border-input"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                onSelect("", "");
                setShowSuggestions(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="button-clear-search"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {showSuggestions && searchQuery && searchResults.length > 0 && (
          <Card className="absolute z-50 w-full mt-2 p-2 max-h-80 overflow-auto shadow-lg">
            <ScrollArea className="max-h-72">
              {searchResults.map((supplier) => (
                <button
                  key={supplier.id}
                  onClick={() => handleSelectSupplier(supplier)}
                  className="w-full text-left px-4 py-3 rounded-md hover-elevate active-elevate-2 transition-colors"
                  data-testid={`button-supplier-${supplier.id}`}
                >
                  <div className="font-medium text-foreground">{supplier.name}</div>
                </button>
              ))}
            </ScrollArea>
          </Card>
        )}
      </div>

      {recentSuppliers.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">Mes derniers</Label>
          <div className="flex flex-wrap gap-2">
            {recentSuppliers.map((supplier) => (
              <Badge
                key={supplier.id}
                variant="secondary"
                className="cursor-pointer px-4 py-2 text-sm hover-elevate"
                onClick={() => handleSelectSupplier(supplier)}
                data-testid={`badge-recent-${supplier.id}`}
              >
                {supplier.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium text-muted-foreground">Plus gros volumes</Label>
        <div className="flex flex-wrap gap-2">
          {topVolumeSuppliers.map((supplier) => (
            <Badge
              key={supplier.id}
              variant="outline"
              className="cursor-pointer px-4 py-2 text-sm hover-elevate"
              onClick={() => handleSelectSupplier(supplier)}
              data-testid={`badge-top-volume-${supplier.id}`}
            >
              {supplier.name}
            </Badge>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleNewSupplier}
        className="w-full h-14 text-base gap-2"
        data-testid="button-new-supplier"
      >
        <Plus className="h-5 w-5" />
        Nouveau fournisseur
      </Button>

      <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau fournisseur</DialogTitle>
            <DialogDescription>
              Entrez le nom du nouveau fournisseur à créer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-supplier-name">Nom du fournisseur</Label>
              <Input
                id="new-supplier-name"
                data-testid="input-new-supplier-name"
                value={newSupplierName}
                onChange={(e) => {
                  setNewSupplierName(e.target.value);
                  checkSimilarity(e.target.value);
                }}
                placeholder="Nom du fournisseur"
                className="h-12"
              />
            </div>

            {similarSupplier && (
              <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-3 flex-1">
                    <div className="text-sm">
                      <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                        Un fournisseur similaire existe déjà
                      </p>
                      <p className="text-amber-800 dark:text-amber-200">
                        <strong>{similarSupplier.name}</strong>
                      </p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Voulez-vous utiliser ce fournisseur existant ou créer un nouveau ?
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUseSimilar}
                        className="flex-1"
                        data-testid="button-use-existing"
                      >
                        Utiliser l'existant
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateSupplier}
                        disabled={isCreating || !newSupplierName.trim()}
                        className="flex-1"
                        data-testid="button-create-anyway"
                      >
                        Créer quand même
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {!similarSupplier && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewSupplierDialog(false)}
                data-testid="button-cancel-new-supplier"
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleCreateSupplier}
                disabled={isCreating || !newSupplierName.trim()}
                data-testid="button-confirm-new-supplier"
              >
                {isCreating ? "Création..." : "Créer"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
