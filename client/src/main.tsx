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
import EmailVerificationPage from "./pages/EmailVerificationPage";
import { useUser } from "./hooks/use-user";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Header from "./components/Header";

function UnverifiedEmailMessage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-purple-100 p-8">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-purple-600 mb-4">Email Verification Required</h1>
        <p className="text-gray-600 mb-4">
          Please verify your email address to access this feature. Check your inbox for the verification link we sent you.
        </p>
        <p className="text-sm text-gray-500">
          If you haven't received the verification email, you may need to check your spam folder or request a new verification link.
        </p>
      </div>
    </div>
  );
}

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

  // Show message for unverified users
  if (!user.emailVerified) {
    return <UnverifiedEmailMessage />;
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
          <Route path="/verify-email">
            <EmailVerificationPage />
          </Route>
          <Route path="/verify-email/:token">
            <EmailVerificationPage />
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

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
