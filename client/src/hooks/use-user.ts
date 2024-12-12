import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User, InsertUser } from "@db/schema";

type RequestResult = {
  ok: boolean;
  message?: string;
  data?: User | null;
};

async function handleRequest<T extends Record<string, unknown>>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: T
): Promise<RequestResult> {
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
    const response = await fetch('/api/user', {
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.log('User not authenticated');
        return null;
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const userData = await response.json();
    console.log('User data received:', userData);
    if (!userData) {
      return null;
    }
    
    // Ensure the response matches our User type
    const user: User = {
      id: userData.id,
      email: userData.email,
      password: userData.password,
      provider: userData.provider || 'local',
      providerId: userData.providerId || null,
      displayName: userData.displayName || null,
      avatarUrl: userData.avatarUrl || null,
      childPhotoUrl: userData.childPhotoUrl || null,
      bio: userData.bio || null,
      emailVerified: Boolean(userData.emailVerified),
      verificationToken: userData.verificationToken || null,
      verificationTokenExpiry: userData.verificationTokenExpiry ? new Date(userData.verificationTokenExpiry) : null,
      resetToken: userData.resetToken || null,
      resetTokenExpiry: userData.resetTokenExpiry ? new Date(userData.resetTokenExpiry) : null,
      lastLoginAt: userData.lastLoginAt ? new Date(userData.lastLoginAt) : null,
      active: typeof userData.active === 'boolean' ? userData.active : true,
      createdAt: new Date(userData.createdAt),
      updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : new Date()
    };

    console.log('Processed user data:', {
      id: user.id,
      email: user.email,
      timestamp: new Date().toISOString()
    });

    return user;
  } catch (error: any) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, error, isLoading } = useQuery<User | null, Error>({
    queryKey: ['user'],
    queryFn: fetchUser,
    staleTime: 0,
    gcTime: 0, // replaces deprecated cacheTime
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const loginMutation = useMutation<RequestResult, Error, InsertUser>({
    mutationFn: async (userData) => {
      console.log('Attempting login with:', { email: userData.email });
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Login failed');
      }

      const data = await response.json();
      console.log('Login response:', data);

      // Immediately set the user data in cache and invalidate queries
      queryClient.setQueryData(['user'], data.user);
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      
      return {
        ok: true,
        data: data
      };
    },
    onSuccess: async (data) => {
      // Update the cache with the user data
      queryClient.setQueryData(['user'], data.data.user);
      // Force immediate refetch to ensure we have the latest data
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      await queryClient.refetchQueries({ queryKey: ['user'], exact: true });
    },
    onError: (error) => {
      console.error('Login mutation failed:', error);
      queryClient.setQueryData(['user'], null);
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
