import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "wouter";

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  storyCredits: number;
  avatarUrl: string | null;
  emailVerified: boolean;
  bio?: string;
}

export interface ApiResponse {
  ok: boolean;
  message?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData extends LoginData {
  displayName: string;
}

export interface ProfileUpdateData {
  displayName?: string;
  bio?: string;
  avatar?: File;
  childPhoto?: File;
}

export interface LoginResponse extends ApiResponse {
  user: User | null;
  emailVerified?: boolean;
}

export interface RegisterResponse extends ApiResponse {
  user: {
    id: number;
    email: string;
    displayName: string;
    emailVerified: boolean;
  } | null;
}

export interface ProfileResponse extends ApiResponse {
  user: User | null;
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

  const login = async (data: LoginData): Promise<LoginResponse> => {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      return { ok: false, message: result.error || "Login failed", user: null };
    }
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    return { 
      ok: true, 
      user: result.user,
      emailVerified: result.user?.emailVerified
    };
  };

  const register = async (data: RegisterData): Promise<RegisterResponse> => {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      return { ok: false, message: result.error || "Registration failed", user: null };
    }
    return { 
      ok: true, 
      user: result.user ? {
        ...result.user,
        emailVerified: false
      } : null
    };
  };

  const logout = async (): Promise<ApiResponse> => {
    const response = await fetch("/api/logout", {
      method: "POST",
    });
    if (!response.ok) {
      return { ok: false, message: "Logout failed" };
    }
    queryClient.clear();
    setLocation("/auth");
    return { ok: true };
  };

  const updateProfile = async (data: ProfileUpdateData): Promise<ProfileResponse> => {
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
    const result = await response.json();
    if (!response.ok) {
      return { ok: false, message: result.error || "Profile update failed", user: null };
    }
    await queryClient.invalidateQueries({ queryKey: ["user"] });
    return { ok: true, user: result.user };
  };

  const deleteAccount = async (): Promise<ApiResponse> => {
    const response = await fetch("/api/profile", {
      method: "DELETE",
    });
    if (!response.ok) {
      const result = await response.json();
      return { ok: false, message: result.error || "Account deletion failed" };
    }
    queryClient.clear();
    setLocation("/auth");
    return { ok: true };
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
