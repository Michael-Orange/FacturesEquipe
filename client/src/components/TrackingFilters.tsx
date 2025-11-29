import { ArrowUpDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import type { Category } from "@shared/schema";

export interface InvoiceFilters {
  type: "all" | "expense" | "supplier_invoice";
  categoryId: string;
  hasBrs: boolean;
  isStockPurchase: boolean;
  sortBy: "date" | "supplier" | "amount";
  sortOrder: "asc" | "desc";
}

interface TrackingFiltersProps {
  filters: InvoiceFilters;
  categories: Category[];
  onFiltersChange: (filters: InvoiceFilters) => void;
}

export function TrackingFilters({ filters, categories, onFiltersChange }: TrackingFiltersProps) {
  const handleTypeChange = (value: string) => {
    onFiltersChange({ ...filters, type: value as InvoiceFilters["type"] });
  };

  const handleCategoryChange = (value: string) => {
    onFiltersChange({ ...filters, categoryId: value });
  };

  const handleSortByChange = (value: string) => {
    onFiltersChange({ ...filters, sortBy: value as InvoiceFilters["sortBy"] });
  };

  const toggleSortOrder = () => {
    onFiltersChange({
      ...filters,
      sortOrder: filters.sortOrder === "asc" ? "desc" : "asc",
    });
  };

  const handleBrsChange = (checked: boolean) => {
    onFiltersChange({ ...filters, hasBrs: checked });
  };

  const handleStockChange = (checked: boolean) => {
    onFiltersChange({ ...filters, isStockPurchase: checked });
  };

  const resetFilters = () => {
    onFiltersChange({
      type: "all",
      categoryId: "all",
      hasBrs: false,
      isStockPurchase: false,
      sortBy: "date",
      sortOrder: "desc",
    });
  };

  const hasActiveFilters =
    filters.type !== "all" ||
    filters.categoryId !== "all" ||
    filters.hasBrs ||
    filters.isStockPurchase;

  return (
    <Card className="p-4 mb-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" />
            Filtres et tri
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              data-testid="button-reset-filters"
            >
              Réinitialiser
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={filters.type} onValueChange={handleTypeChange}>
              <SelectTrigger data-testid="select-filter-type">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="expense">Dépense</SelectItem>
                <SelectItem value="supplier_invoice">Facture Fournisseur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Catégorie</Label>
            <Select value={filters.categoryId} onValueChange={handleCategoryChange}>
              <SelectTrigger data-testid="select-filter-category">
                <SelectValue placeholder="Toutes les catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.appName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Trier par</Label>
            <div className="flex gap-2">
              <Select value={filters.sortBy} onValueChange={handleSortByChange}>
                <SelectTrigger className="flex-1" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="supplier">Fournisseur</SelectItem>
                  <SelectItem value="amount">Montant</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSortOrder}
                data-testid="button-toggle-sort-order"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Options</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-brs"
                  checked={filters.hasBrs}
                  onCheckedChange={(checked) => handleBrsChange(checked === true)}
                  data-testid="checkbox-filter-brs"
                />
                <Label htmlFor="filter-brs" className="text-sm cursor-pointer">
                  Avec BRS uniquement
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-stock"
                  checked={filters.isStockPurchase}
                  onCheckedChange={(checked) => handleStockChange(checked === true)}
                  data-testid="checkbox-filter-stock"
                />
                <Label htmlFor="filter-stock" className="text-sm cursor-pointer">
                  Achats stock uniquement
                </Label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
