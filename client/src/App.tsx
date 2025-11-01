import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import InvoiceSubmission from "@/pages/InvoiceSubmission";
import Tracking from "@/pages/Tracking";
import InvoiceEdit from "@/pages/InvoiceEdit";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/admin" component={Admin} />
      <Route path="/edit/:invoiceId/:userToken" component={InvoiceEdit} />
      <Route path="/tracking/:userToken" component={Tracking} />
      <Route path="/:userToken" component={InvoiceSubmission} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
