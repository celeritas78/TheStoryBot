import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User, InsertUser } from "@db/schema";

type RequestResult = {
  ok: true;
} | {
  ok: false;
  message: string;
};

async function handleRequest<T extends Record<string, unknown>>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: T
): Promise<{ ok: boolean; message?: string; data?: any }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return { 
        ok: false, 
        message: data?.message || response.statusText,
        data: data 
      };
    }

    return { 
      ok: true, 
      data: data 
    };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Unexpected error occurred' };
  }
}

async function fetchUser(): Promise<User | null> {
  try {
    const response = await fetch('/api/user', { credentials: 'include' });
    if (!response.ok) {
      if (response.status === 401) return null;
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('Failed to fetch user:', error);
    throw error;
  }
}

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, error, isLoading } = useQuery<User | null, Error>({
    queryKey: ['user'],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation<{ ok: boolean; message?: string; data?: any }, Error, InsertUser>({
    mutationFn: async (userData) => {
      const result = await handleRequest('/api/login', 'POST', userData);
      if (result.ok && result.data?.user) {
        // Immediately update the user data in the cache
        queryClient.setQueryData(['user'], result.data.user);
      }
      return result;
    },
    onSuccess: async (data) => {
      if (data.ok) {
        await queryClient.invalidateQueries({ queryKey: ['user'] });
      }
    },
  });

  const logoutMutation = useMutation<RequestResult, Error>({
    mutationFn: () => handleRequest('/api/logout', 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const registerMutation = useMutation<RequestResult, Error, InsertUser>({
    mutationFn: (userData) => handleRequest('/api/register', 'POST', userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const updateProfileMutation = useMutation<RequestResult, Error, Partial<User>>({
    mutationFn: (profileData) => handleRequest('/api/profile', 'PUT', profileData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const deleteAccountMutation = useMutation<RequestResult, Error>({
    mutationFn: () => handleRequest('/api/account', 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    updateProfile: updateProfileMutation.mutateAsync,
    deleteAccount: deleteAccountMutation.mutateAsync,
  };
}
