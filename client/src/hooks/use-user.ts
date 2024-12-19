import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  bio?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData extends LoginData {
  displayName: string;
}

interface ProfileUpdateData {
  displayName?: string;
  bio?: string;
  avatar?: File;
  childPhoto?: File;
}

export function useUser() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

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

  const login = async (data: LoginData) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Login failed");
    }
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    return response.json();
  };

  const register = async (data: RegisterData) => {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Registration failed");
    }
    return response.json();
  };

  const logout = async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("Logout failed");
    }
    queryClient.clear();
    setLocation("/auth");
  };

  const updateProfile = async (data: ProfileUpdateData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        formData.append(key, value);
      }
    });

    const response = await fetch("/api/profile", {
      method: "PUT",
      body: formData,
    });
    if (!response.ok) {
      throw new Error("Profile update failed");
    }
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    return response.json();
  };

  const deleteAccount = async () => {
    const response = await fetch("/api/profile", {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Account deletion failed");
    }
    queryClient.clear();
    setLocation("/auth");
  };

  return {
    user,
    isLoading,
    error,
    login,
    register,
    logout,
    updateProfile,
    deleteAccount,
  };
}
