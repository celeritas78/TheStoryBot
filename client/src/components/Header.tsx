import { Link, useLocation } from "wouter";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Home, PenSquare, Settings, Book } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Header() {
  const { user, logout } = useUser();
  const [location] = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = "/";
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  const isActive = (path: string) => location === path;

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/">
              <div className="flex items-center gap-2">
                <img src="/images/logo.png" alt="Story Bot Logo" className="h-8 w-8" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text">
                  The Story Bot
                </h1>
              </div>
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/">
                <Button 
                  variant="ghost" 
                  className={`flex items-center gap-2 ${isActive("/") ? "bg-purple-100 text-purple-800" : ""}`}
                >
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </Button>
              </Link>
              <Link href="/create">
                <Button 
                  variant="ghost" 
                  className={`flex items-center gap-2 ${isActive("/create") ? "bg-purple-100 text-purple-800" : ""}`}
                >
                  <PenSquare className="h-4 w-4" />
                  <span>Create Story</span>
                </Button>
              </Link>
              <Link href="/library">
                <Button 
                  variant="ghost" 
                  className={`flex items-center gap-2 ${isActive("/library") ? "bg-purple-100 text-purple-800" : ""}`}
                >
                  <Book className="h-4 w-4" />
                  <span>Library</span>
                </Button>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user.avatarUrl || ''} alt={user.displayName || user.email} />
                      <AvatarFallback>{(user.displayName || user.email).charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span>{user.displayName || user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <Link href="/profile">
                    <DropdownMenuItem className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      Profile Settings
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/auth">
                <Button>Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
