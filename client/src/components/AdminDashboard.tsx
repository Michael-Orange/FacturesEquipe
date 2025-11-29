import { useState } from "react";
import { Download, Archive, Lock, Database, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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
import { useToast } from "@/hooks/use-toast";

interface AdminDashboardProps {
  onExportCSV: () => Promise<void>;
  onExportAxonautMichael: () => Promise<void>;
  onExportAxonautMarine: () => Promise<void>;
  onExportAxonautFatou: () => Promise<void>;
  onResetDatabase: () => Promise<void>;
  onLogout: () => void;
}

export function AdminDashboard({ onExportCSV, onExportAxonautMichael, onExportAxonautMarine, onExportAxonautFatou, onResetDatabase, onLogout }: AdminDashboardProps) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAxonautMichael, setIsExportingAxonautMichael] = useState(false);
  const [isExportingAxonautMarine, setIsExportingAxonautMarine] = useState(false);
  const [isExportingAxonautFatou, setIsExportingAxonautFatou] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();
  
  // Zoho export states (Expenses)
  const [zohoDateStart, setZohoDateStart] = useState<string>("");
  const [zohoDateEnd, setZohoDateEnd] = useState<string>("");
  const [isExportingZohoMichael, setIsExportingZohoMichael] = useState(false);
  const [isExportingZohoMarine, setIsExportingZohoMarine] = useState(false);
  const [isExportingZohoFatou, setIsExportingZohoFatou] = useState(false);
  const [isExportingZohoAll, setIsExportingZohoAll] = useState(false);
  
  // Zoho Bills export states (Factures Fournisseurs)
  const [billsDateStart, setBillsDateStart] = useState<string>("");
  const [billsDateEnd, setBillsDateEnd] = useState<string>("");
  const [isExportingBillsMichael, setIsExportingBillsMichael] = useState(false);
  const [isExportingBillsMarine, setIsExportingBillsMarine] = useState(false);
  const [isExportingBillsFatou, setIsExportingBillsFatou] = useState(false);
  const [isExportingBillsAll, setIsExportingBillsAll] = useState(false);

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      await onExportCSV();
      toast({
        title: "Export réussi",
        description: "Le fichier CSV a été téléchargé",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAxonautMichael = async () => {
    setIsExportingAxonautMichael(true);
    try {
      await onExportAxonautMichael();
      toast({
        title: "Export Axonaut Michael réussi",
        description: "Le fichier d'export Axonaut pour Michael a été téléchargé",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données Axonaut pour Michael",
        variant: "destructive",
      });
    } finally {
      setIsExportingAxonautMichael(false);
    }
  };

  const handleExportAxonautMarine = async () => {
    setIsExportingAxonautMarine(true);
    try {
      await onExportAxonautMarine();
      toast({
        title: "Export Axonaut Marine réussi",
        description: "Le fichier d'export Axonaut pour Marine a été téléchargé",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données Axonaut pour Marine",
        variant: "destructive",
      });
    } finally {
      setIsExportingAxonautMarine(false);
    }
  };

  const handleExportAxonautFatou = async () => {
    setIsExportingAxonautFatou(true);
    try {
      await onExportAxonautFatou();
      toast({
        title: "Export Axonaut Fatou réussi",
        description: "Le fichier d'export Axonaut pour Fatou a été téléchargé",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données Axonaut pour Fatou",
        variant: "destructive",
      });
    } finally {
      setIsExportingAxonautFatou(false);
    }
  };

  const handleResetDatabase = async () => {
    setIsResetting(true);
    try {
      await onResetDatabase();
      toast({
        title: "Données archivées avec succès",
        description: "Les factures ont été archivées",
      });
      setResetDialogOpen(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'archiver les données",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Zoho export handler
  const handleExportZoho = async (user: "michael" | "marine" | "fatou" | "all") => {
    const setLoading = {
      michael: setIsExportingZohoMichael,
      marine: setIsExportingZohoMarine,
      fatou: setIsExportingZohoFatou,
      all: setIsExportingZohoAll,
    }[user];
    
    setLoading(true);
    try {
      // Build query params
      const params = new URLSearchParams();
      params.append("user", user);
      if (zohoDateStart) params.append("date_start", zohoDateStart);
      if (zohoDateEnd) params.append("date_end", zohoDateEnd);
      
      const response = await fetch(`/api/admin/export-zoho-expenses?${params.toString()}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("adminSessionToken")}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      // Get the count from header
      const count = response.headers.get("X-Export-Count") || "0";
      
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      // Get filename from Content-Disposition header or generate one
      const disposition = response.headers.get("Content-Disposition");
      let filename = `Depenses_Zoho_${user}.csv`;
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      const userLabel = user === "all" ? "toutes" : user.charAt(0).toUpperCase() + user.slice(1);
      toast({
        title: "Export Zoho réussi",
        description: `${count} dépenses exportées pour ${userLabel}`,
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données Zoho",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Zoho Bills export handler (Factures Fournisseurs)
  const handleExportBills = async (user: "michael" | "marine" | "fatou" | "all") => {
    const setLoading = {
      michael: setIsExportingBillsMichael,
      marine: setIsExportingBillsMarine,
      fatou: setIsExportingBillsFatou,
      all: setIsExportingBillsAll,
    }[user];
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("user", user);
      if (billsDateStart) params.append("date_start", billsDateStart);
      if (billsDateEnd) params.append("date_end", billsDateEnd);
      
      const response = await fetch(`/api/admin/export-zoho-bills?${params.toString()}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("adminSessionToken")}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      const count = response.headers.get("X-Export-Count") || "0";
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const disposition = response.headers.get("Content-Disposition");
      let filename = `Factures_Fournisseurs_${user}.csv`;
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      const userLabel = user === "all" ? "toutes" : user.charAt(0).toUpperCase() + user.slice(1);
      toast({
        title: "Export Zoho Bills réussi",
        description: `${count} factures fournisseurs exportées pour ${userLabel}`,
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les factures fournisseurs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-primary">Administration</h1>
          <p className="text-muted-foreground mt-1">Gestion des données de l'application</p>
        </div>
        <Button
          variant="outline"
          onClick={onLogout}
          data-testid="button-logout"
        >
          <Lock className="h-4 w-4 mr-2" />
          Déconnexion
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="hover-elevate">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <Download className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Exporter les données</CardTitle>
                <CardDescription className="mt-1">
                  Télécharger toutes les factures en CSV
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="w-full h-12"
              data-testid="button-export-csv"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExporting ? "Export en cours..." : "Exporter en CSV"}
            </Button>
            <Button
              onClick={handleExportAxonautMichael}
              disabled={isExportingAxonautMichael}
              variant="secondary"
              className="w-full h-12"
              data-testid="button-export-axonaut-michael"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingAxonautMichael ? "Export en cours..." : "Axonaut - Michael"}
            </Button>
            <Button
              onClick={handleExportAxonautMarine}
              disabled={isExportingAxonautMarine}
              variant="secondary"
              className="w-full h-12"
              data-testid="button-export-axonaut-marine"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingAxonautMarine ? "Export en cours..." : "Axonaut - Marine"}
            </Button>
            <Button
              onClick={handleExportAxonautFatou}
              disabled={isExportingAxonautFatou}
              variant="secondary"
              className="w-full h-12"
              data-testid="button-export-axonaut-fatou"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingAxonautFatou ? "Export en cours..." : "Axonaut - Fatou"}
            </Button>
          </CardContent>
        </Card>

        <Card className="hover-elevate border-destructive/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-destructive/10 p-3">
                <Database className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-destructive">Archivage des données</CardTitle>
                <CardDescription className="mt-1">
                  Archiver les factures actives
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setResetDialogOpen(true)}
              className="w-full h-12"
              data-testid="button-reset-database"
            >
              <Archive className="h-5 w-5 mr-2" />
              Archiver les données
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Zoho Exports Section - Full Width */}
      <Card className="hover-elevate">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-500/10 p-3">
              <Calendar className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <CardTitle>Export Zoho Books - Dépenses</CardTitle>
              <CardDescription className="mt-1">
                Exporter les dépenses au format Zoho Books (uniquement les dépenses, pas les factures fournisseur)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="zoho-date-start">Date de début</Label>
              <Input
                id="zoho-date-start"
                type="date"
                value={zohoDateStart}
                onChange={(e) => setZohoDateStart(e.target.value)}
                data-testid="input-zoho-date-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoho-date-end">Date de fin</Label>
              <Input
                id="zoho-date-end"
                type="date"
                value={zohoDateEnd}
                onChange={(e) => setZohoDateEnd(e.target.value)}
                data-testid="input-zoho-date-end"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Button
              onClick={() => handleExportZoho("michael")}
              disabled={isExportingZohoMichael}
              variant="secondary"
              className="h-12"
              data-testid="button-export-zoho-michael"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingZohoMichael ? "Export..." : "Michael"}
            </Button>
            <Button
              onClick={() => handleExportZoho("marine")}
              disabled={isExportingZohoMarine}
              variant="secondary"
              className="h-12"
              data-testid="button-export-zoho-marine"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingZohoMarine ? "Export..." : "Marine"}
            </Button>
            <Button
              onClick={() => handleExportZoho("fatou")}
              disabled={isExportingZohoFatou}
              variant="secondary"
              className="h-12"
              data-testid="button-export-zoho-fatou"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingZohoFatou ? "Export..." : "Fatou"}
            </Button>
            <Button
              onClick={() => handleExportZoho("all")}
              disabled={isExportingZohoAll}
              className="h-12"
              data-testid="button-export-zoho-all"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingZohoAll ? "Export..." : "Toutes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Zoho Bills Export - Factures Fournisseurs */}
      <Card className="hover-elevate">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-indigo-500/10 p-3">
              <FileText className="h-6 w-6 text-indigo-500" />
            </div>
            <div>
              <CardTitle>Export Zoho Books - Factures Fournisseurs</CardTitle>
              <CardDescription className="mt-1">
                Exporter les factures fournisseurs au format Zoho Bills (uniquement les factures fournisseurs, pas les dépenses)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bills-date-start">Date de début</Label>
              <Input
                id="bills-date-start"
                type="date"
                value={billsDateStart}
                onChange={(e) => setBillsDateStart(e.target.value)}
                data-testid="input-bills-date-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bills-date-end">Date de fin</Label>
              <Input
                id="bills-date-end"
                type="date"
                value={billsDateEnd}
                onChange={(e) => setBillsDateEnd(e.target.value)}
                data-testid="input-bills-date-end"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Button
              onClick={() => handleExportBills("michael")}
              disabled={isExportingBillsMichael}
              variant="secondary"
              className="h-12"
              data-testid="button-export-bills-michael"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingBillsMichael ? "Export..." : "FF Michael"}
            </Button>
            <Button
              onClick={() => handleExportBills("marine")}
              disabled={isExportingBillsMarine}
              variant="secondary"
              className="h-12"
              data-testid="button-export-bills-marine"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingBillsMarine ? "Export..." : "FF Marine"}
            </Button>
            <Button
              onClick={() => handleExportBills("fatou")}
              disabled={isExportingBillsFatou}
              variant="secondary"
              className="h-12"
              data-testid="button-export-bills-fatou"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingBillsFatou ? "Export..." : "FF Fatou"}
            </Button>
            <Button
              onClick={() => handleExportBills("all")}
              disabled={isExportingBillsAll}
              className="h-12"
              data-testid="button-export-bills-all"
            >
              <Download className="h-5 w-5 mr-2" />
              {isExportingBillsAll ? "Export..." : "Toutes FF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-lg">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Action</span>
            <span className="font-medium">Description</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Export CSV</span>
            <span className="font-medium">Télécharge toutes les factures de tous les utilisateurs</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Export Axonaut</span>
            <span className="font-medium">Export formaté pour import dans Axonaut</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Export Zoho</span>
            <span className="font-medium">Export des dépenses au format Zoho Books (27 colonnes)</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Archivage</span>
            <span className="font-medium">Archive les factures actives (marque comme archivées + déplace vers archive_YYMMDD)</span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Archiver les données ?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold">
                Cette action archivera les factures actives :
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Les factures seront marquées comme archivées dans la base de données</li>
                <li>Les fichiers seront déplacés vers archive_YYMMDD dans Google Drive</li>
                <li>Les factures archivées ne seront plus visibles dans le suivi</li>
              </ul>
              <p className="mt-4 text-destructive font-medium">
                Êtes-vous certain(e) de vouloir continuer ?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetDatabase}
              disabled={isResetting}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-reset"
            >
              {isResetting ? "Archivage..." : "Oui, archiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
