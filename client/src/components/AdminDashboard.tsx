import { useState } from "react";
import { Download, Archive, Lock, Database, Calendar, FileText, FolderOpen, CheckCircle2, Circle } from "lucide-react";
import { AdminConsolidatedView } from "./AdminConsolidatedView";
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AdminDashboardProps {
  onExportCSV: () => Promise<void>;
  onResetDatabase: () => Promise<void>;
  onLogout: () => void;
}

export function AdminDashboard({ onExportCSV, onResetDatabase, onLogout }: AdminDashboardProps) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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
  
  // BRS Suppliers export loading state (uses shared billsDateStart/billsDateEnd)
  const [isExportingBrsSuppliers, setIsExportingBrsSuppliers] = useState(false);

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

  // BRS Suppliers export handler (uses shared billsDateStart/billsDateEnd)
  const handleExportBrsSuppliers = async () => {
    // Frontend validation - dates are mandatory ONLY for BRS report
    if (!billsDateStart) {
      toast({
        title: "Date de début obligatoire pour le rapport BRS",
        description: "Veuillez saisir une date de début",
        variant: "destructive",
      });
      return;
    }
    if (!billsDateEnd) {
      toast({
        title: "Date de fin obligatoire pour le rapport BRS", 
        description: "Veuillez saisir une date de fin",
        variant: "destructive",
      });
      return;
    }
    if (new Date(billsDateStart) > new Date(billsDateEnd)) {
      toast({
        title: "Dates invalides",
        description: "Date de début doit être avant date de fin",
        variant: "destructive",
      });
      return;
    }
    
    setIsExportingBrsSuppliers(true);
    try {
      const params = new URLSearchParams();
      params.append("date_start", billsDateStart);
      params.append("date_end", billsDateEnd);
      
      const response = await fetch(`/api/admin/export-nouveaux-fournisseurs-brs?${params.toString()}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("adminSessionToken")}`,
        },
      });
      
      const contentType = response.headers.get("Content-Type") || "";
      
      // Handle JSON responses (either errors or no-results message)
      if (contentType.includes("application/json")) {
        const data = await response.json();
        
        // Handle successful "no results" response
        if (response.ok && data.count === 0) {
          toast({
            title: "Aucun résultat",
            description: data.message || "Aucun nouveau fournisseur BRS trouvé pour cette période",
          });
          return;
        }
        
        // Handle error responses
        if (!response.ok) {
          throw new Error(data.message || "Export failed");
        }
        return; // JSON response fully handled
      }
      
      // Handle CSV response
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      const count = response.headers.get("X-Export-Count") || "0";
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const disposition = response.headers.get("Content-Disposition");
      // Generate fallback filename with YYYYMM from billsDateEnd
      const dateEnd = new Date(billsDateEnd);
      const yyyymm = `${dateEnd.getFullYear()}${String(dateEnd.getMonth() + 1).padStart(2, "0")}`;
      let filename = `Nouveaux_Fournisseurs_BRS_${yyyymm}.csv`;
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export généré",
        description: `${count} fournisseurs listés`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'exporter les données";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsExportingBrsSuppliers(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

      <AdminConsolidatedView />

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
                Exporter les factures fournisseurs au format Zoho Bills. Le rapport BRS liste les nouveaux fournisseurs avec retenue à la source 5%.
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
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
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
          <Button
            onClick={handleExportBrsSuppliers}
            disabled={isExportingBrsSuppliers}
            variant="secondary"
            className="w-full h-12"
            data-testid="button-export-brs-suppliers"
          >
            <Download className="h-5 w-5 mr-2" />
            {isExportingBrsSuppliers ? "Export en cours..." : "Rapport Nouveaux Fournisseurs BRS"}
          </Button>
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <span className="text-primary">i</span>
            Dates obligatoires uniquement pour le rapport BRS
          </p>
        </CardContent>
      </Card>

      <ProjectManagement />

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
            <span className="text-muted-foreground">Export Zoho Dépenses</span>
            <span className="font-medium">Export des dépenses au format Zoho Books (27 colonnes)</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Export Zoho Bills</span>
            <span className="font-medium">Factures fournisseurs + Rapport nouveaux fournisseurs BRS</span>
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

interface Project {
  id: string;
  number: string;
  name: string;
  isCompleted: boolean | null;
}

function ProjectManagement() {
  const { toast } = useToast();
  
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const toggleMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await apiRequest("PUT", `/api/admin/projects/${projectId}/toggle-completed`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Projet mis à jour" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de modifier le projet", variant: "destructive" });
    },
  });

  const sortedProjects = [...projects].sort((a, b) => b.number.localeCompare(a.number));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Gestion des projets
        </CardTitle>
        <CardDescription>Marquer les projets comme terminés pour les masquer du menu déroulant</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Chargement...</p>
        ) : (
          <div className="space-y-1">
            {sortedProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover-elevate"
                data-testid={`project-row-${project.id}`}
              >
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${project.isCompleted ? "text-muted-foreground line-through" : ""}`}>
                    {project.number} - {project.name}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={project.isCompleted ? "secondary" : "outline"}
                  onClick={() => toggleMutation.mutate(project.id)}
                  disabled={toggleMutation.isPending}
                  data-testid={`button-toggle-project-${project.id}`}
                >
                  {project.isCompleted ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Terminé
                    </>
                  ) : (
                    <>
                      <Circle className="h-4 w-4 mr-1" />
                      Actif
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
