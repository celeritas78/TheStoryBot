import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route } from "wouter";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "./pages/HomePage";
import StoryGenerator from "./pages/StoryGenerator";
import LibraryPage from "./pages/Library";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/create" component={StoryGenerator} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/story/:id" component={StoryGenerator} />
      <Route>404 - Page Not Found</Route>
    </Switch>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
