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
          setVerifying(false);
          setError('No verification token found. Please check your verification email and try again.');
          return;
        }

        const response = await fetch(`/api/verify-email/${token}`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }
        });
        
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Verification failed');
        }

        // Verification successful
        setError(null);
        setVerifying(false);
        
        // Update user data
        await queryClient.invalidateQueries({ queryKey: ['user'] });
        await queryClient.refetchQueries({ queryKey: ['user'] });

        toast({
          title: "Email Verified",
          description: "Your email has been verified successfully. You can now use all features of the Story Generator.",
        });

        // Redirect to home page after successful verification
        setTimeout(() => setLocation('/'), 1500);
      } catch (error) {
        console.error('Verification error:', error);
        setVerifying(false);
        if (error instanceof Error) {
          if (error.message.includes('Invalid verification token')) {
            setError('This verification link is no longer valid. Please request a new verification email.');
          } else {
            setError(error.message);
          }
        } else {
          setError('An unexpected error occurred during verification. Please try again later.');
        }
      }
    };

    verifyEmail();
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
          {verifying && !error && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-border mb-4" />
              <p className="text-center text-muted-foreground">
                Please wait while we verify your email...
              </p>
            </>
          )}
          {error && (
            <div className="text-center text-destructive">
              <p className="font-semibold mb-2">Unable to verify email</p>
              <p className="text-sm">{error}</p>
            </div>
          )}
          {!verifying && !error && (
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
