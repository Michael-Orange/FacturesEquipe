import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Shield } from "lucide-react";
import { AdminDashboard } from "@/components/AdminDashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (pwd: string) => {
      return await apiRequest("POST", "/api/admin/login", { password: pwd });
    },
    onSuccess: () => {
      setIsAuthenticated(true);
      setPassword("");
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Mot de passe incorrect",
        variant: "destructive",
      });
    },
  });

  const exportCSVMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/export-csv");
      if (!response.ok) throw new Error("Erreur lors de l'export");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `factures_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });

  const resetDatabaseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/reset-database", {});
    },
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    try {
      await loginMutation.mutateAsync(password);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-primary/10 p-4">
                <Shield className="h-12 w-12 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-primary mb-2">Administration</h1>
            <p className="text-muted-foreground">Authentification requise</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Entrez le mot de passe admin"
                className="h-12"
                data-testid="input-admin-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12"
              disabled={isLoading || !password.trim()}
              data-testid="button-admin-login"
            >
              <Lock className="h-5 w-5 mr-2" />
              {isLoading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-6 px-4 shadow-md">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">FiltrePlante</h1>
              <p className="text-sm text-primary-foreground/90">Administration</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AdminDashboard
          onExportCSV={exportCSVMutation.mutateAsync}
          onResetDatabase={resetDatabaseMutation.mutateAsync}
          onLogout={handleLogout}
        />
      </main>
    </div>
  );
}
