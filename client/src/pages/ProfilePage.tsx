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

  const handleChildPhotoUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await fetch('/api/profile/child-photo', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to upload photo');
      }

      const { childPhotoUrl, user } = await response.json();
      
      // Invalidate and refetch user data to ensure we have the latest
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      
      // Update the React Query cache with the new user data
      queryClient.setQueryData(['user'], () => user);

      toast({
        title: "Photo uploaded",
        description: "Your child's photo has been uploaded successfully.",
      });
    } catch (error) {
      console.error('Photo upload error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload photo",
      });
    } finally {
      setIsUploading(false);
    }
  }, [queryClient, toast]);

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
            <div className="space-y-2">
              <Label>Child's Photo</Label>
              <div className="flex flex-col items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                <div className="relative w-32 h-32 rounded-full overflow-hidden">
                  {user.childPhotoUrl ? (
                    <OptimizedImage
                      src={user.childPhotoUrl}
                      alt="Child's photo"
                      className="object-cover w-full h-full"
                      priority={true}
                      fallbackSrc="/assets/avatar-placeholder.png"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 rounded-full flex items-center justify-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleChildPhotoUpload}
                    disabled={isUploading}
                    className="hidden"
                    id="child-photo-upload"
                  />
                  <Label
                    htmlFor="child-photo-upload"
                    className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        {user.childPhotoUrl ? "Change Photo" : "Upload Photo"}
                      </>
                    )}
                  </Label>
                </div>
              </div>
            </div>
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
                if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                  setIsDeleting(true);
                  try {
                    const result = await deleteAccount();
                    if (!result.ok) {
                      throw new Error(result.message);
                    }
                    toast({
                      title: "Account deleted",
                      description: "Your account has been permanently deleted.",
                    });
                    window.location.href = "/";
                  } catch (error) {
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: error instanceof Error ? error.message : "Failed to delete account",
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
                  Deleting Account
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
