import { useState } from "react";
import { Download, Trash2, Lock, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  onResetDatabase: () => Promise<void>;
  onLogout: () => void;
}

export function AdminDashboard({ onExportCSV, onResetDatabase, onLogout }: AdminDashboardProps) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();

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
        title: "Base de données réinitialisée",
        description: "Toutes les factures ont été supprimées",
      });
      setResetDialogOpen(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de réinitialiser la base de données",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
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
          <CardContent>
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
                <CardTitle className="text-destructive">Zone dangereuse</CardTitle>
                <CardDescription className="mt-1">
                  Réinitialiser toutes les données
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
              <Trash2 className="h-5 w-5 mr-2" />
              Réinitialiser la base de données
            </Button>
          </CardContent>
        </Card>
      </div>

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
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Réinitialisation</span>
            <span className="font-medium">Supprime toutes les factures (BDD + Google Drive)</span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Réinitialiser la base de données ?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold">
                Cette action est IRRÉVERSIBLE et supprimera :
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Toutes les factures de tous les utilisateurs</li>
                <li>Tous les fichiers sur Google Drive</li>
                <li>Toutes les données associées</li>
              </ul>
              <p className="mt-4 text-destructive font-medium">
                Êtes-vous absolument certain(e) de vouloir continuer ?
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
              {isResetting ? "Suppression..." : "Oui, tout supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
