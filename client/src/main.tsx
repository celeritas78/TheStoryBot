import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route, useLocation } from "wouter";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import StoryGenerator from "./pages/StoryGenerator";
import LibraryPage from "./pages/Library";
import StoryPage from "./pages/StoryPage";
import ProfilePage from "./pages/ProfilePage";
import { useUser } from "./hooks/use-user";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Header from "./components/Header";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      const currentPath = window.location.pathname;
      setLocation(`/auth?redirect=${encodeURIComponent(currentPath)}`);
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <Component />;
}

function AppRoutes() {
  return (
    <ErrorBoundary>
      <>
        <Header />
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/create">
            <ProtectedRoute component={StoryGenerator} />
          </Route>
          <Route path="/library">
            <ProtectedRoute component={LibraryPage} />
          </Route>
          <Route path="/story/:id">
            <ProtectedRoute component={StoryPage} />
          </Route>
          <Route path="/profile">
            <ProtectedRoute component={ProfilePage} />
          </Route>
          <Route>404 - Page Not Found</Route>
        </Switch>
      </>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AppRoutes />
        <Toaster />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
