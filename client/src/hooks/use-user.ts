import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "wouter";

interface User {
  id: number;
  email: string;
  displayName: string | null;
  storyCredits: number;
  avatarUrl: string | null;
  childPhotoUrl: string | null;
  emailVerified: boolean;
}

export function useUser() {
  const [, setLocation] = useLocation();

  const { data: user, error, isLoading } = useQuery<User>({
    queryKey: ["user"],
    queryFn: async () => {
      const response = await fetch("/api/user");
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Not authenticated");
        }
        throw new Error("Failed to fetch user data");
      }
      return response.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (error && error instanceof Error && error.message === "Not authenticated") {
      setLocation("/auth");
    }
  }, [error, setLocation]);

  return {
    user,
    isLoading,
    error,
  };
}
