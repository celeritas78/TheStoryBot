import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import { OptimizedImage } from "@/components/OptimizedImage";

export default function ProfilePage() {
  const { user, isLoading, updateProfile, deleteAccount } = useUser();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  // Photo upload functionality removed as part of Stripe payment system removal

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const formData = new FormData(event.currentTarget);
      const profileData = {
        displayName: formData.get("displayName") as string,
        bio: formData.get("bio") as string,
        avatarUrl: formData.get("avatarUrl") as string,
      };

      const result = await updateProfile(profileData);
      if (!result.ok) {
        throw new Error(result.message);
      }

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                value={user.email}
                disabled
                className="bg-gray-50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                name="displayName"
                defaultValue={user.displayName || ""}
                placeholder="Enter your display name"
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                name="avatarUrl"
                defaultValue={user.avatarUrl || ""}
                placeholder="Enter URL for your avatar"
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={user.bio || ""}
                placeholder="Tell us about yourself"
                disabled={isSaving}
              />
            </div>
            {/* Child photo upload section removed as part of Stripe payment system removal */}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t">
            <h3 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h3>
            <p className="text-sm text-gray-600 mb-4">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                const confirmed = window.confirm(
                  "Are you sure you want to delete your account? This action cannot be undone and will permanently remove all your stories and data."
                );
                
                if (confirmed) {
                  setIsDeleting(true);
                  try {
                    const result = await deleteAccount();
                    
                    if (!result.ok) {
                      throw new Error(result.message || "Failed to delete account");
                    }
                    
                    toast({
                      title: "Account deleted",
                      description: "Your account has been permanently deleted. You will be redirected to the home page.",
                    });
                    
                    // Clear any cached data
                    queryClient.clear();
                    
                    // Small delay to show the success message before redirect
                    setTimeout(() => {
                      window.location.href = "/";
                    }, 1500);
                  } catch (error) {
                    console.error("Delete account error:", error);
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: error instanceof Error ? error.message : "Failed to delete account. Please try again.",
                    });
                  } finally {
                    setIsDeleting(false);
                  }
                }
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting Account...
                </>
              ) : (
                "Delete Account"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
