import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User, InsertUser } from "@db/schema";

type RequestResult = {
  ok: boolean;
  message?: string;
  data?: any;
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
    console.log('Fetching user data...');
    const response = await fetch('/api/user', { credentials: 'include' });
    if (!response.ok) {
      if (response.status === 401) {
        console.log('User not authenticated');
        return null;
      }
      console.error(`Error fetching user: ${response.status}: ${response.statusText}`);
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    const userData = await response.json();
    console.log('User data received:', userData);
    return userData;
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

  const loginMutation = useMutation<RequestResult, Error, InsertUser>({
    mutationFn: async (userData) => {
      console.log('Attempting login with:', { email: userData.email });
      const result = await handleRequest('/api/login', 'POST', userData);
      console.log('Login response:', result);
      if (result.ok && result.data?.user) {
        console.log('Setting user data in cache:', result.data.user);
        queryClient.setQueryData(['user'], result.data.user);
      }
      return result;
    },
    onSuccess: async (data) => {
      console.log('Login mutation succeeded:', data);
      if (data.ok) {
        console.log('Invalidating user queries after successful login');
        await queryClient.invalidateQueries({ queryKey: ['user'] });
      }
    },
    onError: (error) => {
      console.error('Login mutation failed:', error);
    }
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
