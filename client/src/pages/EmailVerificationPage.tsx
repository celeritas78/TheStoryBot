import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useQueryClient } from '@tanstack/react-query';

export default function EmailVerificationPage() {
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Extract token from either query params or URL path
        const params = new URLSearchParams(window.location.search);
        const queryToken = params.get('token');
        const pathToken = window.location.pathname.split('/verify-email/')[1];
        const token = queryToken || pathToken;

        console.log('Verification token:', token);
        
        if (!token) {
          setError('Invalid verification link');
          return;
        }

        const response = await fetch(`/api/verify-email/${token}`, {
          credentials: 'include' // Important: Include credentials for session
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Verification failed');
        }

        // Invalidate and refetch user data
        await queryClient.invalidateQueries({ queryKey: ['user'] });
        await queryClient.refetchQueries({ queryKey: ['user'] });

        toast({
          title: "Email Verified",
          description: "Your email has been verified successfully. You can now use all features of the Story Generator.",
        });

        // Redirect to home page after successful verification and state update
        setTimeout(() => setLocation('/'), 1000);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Verification failed');
      } finally {
        setVerifying(false);
      }
    };

    verifyEmail();
  }, [queryClient, setLocation, toast]);

  return (
    <div className="container flex items-center justify-center min-h-screen">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
          <CardDescription>Verifying your email address...</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-6">
          {verifying ? (
            <Loader2 className="h-8 w-8 animate-spin text-border" />
          ) : error ? (
            <div className="text-center text-destructive">{error}</div>
          ) : (
            <div className="text-center text-green-600">
              Email verified successfully! Redirecting...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
