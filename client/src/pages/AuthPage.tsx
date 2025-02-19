import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);
  const { toast } = useToast();
  const { login, register } = useUser();
  const [, setLocation] = useLocation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>, type: "login" | "register") => {
    event.preventDefault();
    setIsLoading(true);
    setRegistrationSuccess(null);

    try {
      const formData = new FormData(event.currentTarget);
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;

      let result;
      if (type === "login") {
        result = await login({ email, password });
      } else {
        result = await register({ 
          email, 
          password, 
          displayName: (formData.get("displayName") as string)
        });
      }

      if (!result.ok) {
        throw new Error(result.message);
      }

      // Update user cache
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      await queryClient.refetchQueries({ queryKey: ['user'] });

      if (type === "login") {
        // Check if email is verified
        if (result.user && !result.user.emailVerified) {
          toast({
            title: "Email not verified",
            description: "Please check your email for the verification link before accessing all features.",
            variant: "default"
          });
        } else {
          toast({
            title: "Login successful",
            description: "Welcome to the Story Generator!",
          });
        }
        const destination = new URLSearchParams(window.location.search).get('redirect') || '/';
        setLocation(destination);
      } else {
        // For registration, show the success message on the page
        setRegistrationSuccess("Registration successful! Please check your email to verify your account. You won't be able to create stories until your email is verified.");
        
        // Safely reset the form
        try {
          const form = event.currentTarget as HTMLFormElement;
          if (form && typeof form.reset === 'function') {
            form.reset();
          }
        } catch (error) {
          console.error('Failed to reset form:', error);
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container flex items-center justify-center min-h-screen">
      <Card className="w-[400px]">
        {registrationSuccess && (
          <div className="p-4 mb-4 text-sm bg-green-50 border-l-4 border-green-500">
            <p className="font-medium text-green-800">{registrationSuccess}</p>
          </div>
        )}
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Login or create an account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={(e) => handleSubmit(e, "login")}>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Loading..." : "Login"}
                  </Button>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={(e) => handleSubmit(e, "register")}>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      name="email"
                      type="email"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="register-displayName">Display Name</Label>
                    <Input
                      id="register-displayName"
                      name="displayName"
                      type="text"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      name="password"
                      type="password"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Loading..." : "Register"}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
