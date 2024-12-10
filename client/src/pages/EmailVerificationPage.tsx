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
    let mounted = true;
    
    const verifyEmail = async () => {
      // Extract token from either query params or URL path
      const params = new URLSearchParams(window.location.search);
      const queryToken = params.get('token');
      const pathToken = window.location.pathname.split('/verify-email/')[1];
      const token = queryToken || pathToken;

      if (!token) {
        if (mounted) {
          setError('No verification token found. Please check your verification email and try again.');
          setVerifying(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/verify-email/${token}`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }
        });
        
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Verification failed');
        }

        if (!mounted) return;

        // Clear error state and set verifying to false
        setError(null);
        setVerifying(false);
        
        // Handle success case first
        setError(null);
        setVerifying(false);

        // Update user data
        await queryClient.invalidateQueries({ queryKey: ['user'] });
        await queryClient.refetchQueries({ queryKey: ['user'] });

        if (!mounted) return;

        // Show success message
        toast({
          title: "Email Verified",
          description: "Your email has been verified successfully. You can now use all features of the Story Generator.",
          duration: 5000,
        });

        // Redirect to home page after a short delay to show the success message
        setTimeout(() => {
          if (mounted) {
            setLocation('/');
          }
        }, 2000);

      } catch (error) {
        if (!mounted) return;

        setVerifying(false);
        
        let errorMessage;
        if (error instanceof Error) {
          if (error.message.includes('Invalid verification token')) {
            // Check if user is already verified
            const userData = await queryClient.getQueryData(['user']);
            if (userData?.emailVerified) {
              errorMessage = 'Your email has already been verified. You can proceed to use all features.';
              // Redirect to home after showing the message
              setTimeout(() => {
                if (mounted) {
                  setLocation('/');
                }
              }, 2000);
            } else {
              errorMessage = 'This verification link is no longer valid. Please request a new verification email.';
            }
          } else {
            errorMessage = error.message;
          }
        } else {
          errorMessage = 'An unexpected error occurred during verification. Please try again later.';
        }
        
        setError(errorMessage);
        console.error('Verification failed:', errorMessage);
        
        toast({
          title: "Verification Status",
          description: errorMessage,
          variant: errorMessage.includes('already been verified') ? 'default' : 'destructive',
          duration: 5000,
        });
      }
    };

    verifyEmail();
    
    return () => {
      mounted = false;
    };
  }, [queryClient, setLocation, toast]);

  return (
    <div className="container flex items-center justify-center min-h-screen">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
          <CardDescription>
            {verifying ? "Verifying your email address..." : 
              error ? "Verification Failed" : 
              "Verification Successful"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-6">
          {verifying ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-border mb-4" />
              <p className="text-center text-muted-foreground">
                Please wait while we verify your email...
              </p>
            </>
          ) : error ? (
            <div className="text-center text-destructive">
              <p className="font-semibold mb-2">Unable to verify email</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : (
            <div className="text-center text-green-600">
              <p className="font-semibold mb-2">Email verified successfully!</p>
              <p className="text-sm">Redirecting you to the homepage...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
