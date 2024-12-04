import { cn } from "@/lib/utils";

interface TitleProps {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Title({ children, className, size = "lg" }: TitleProps) {
  const getFluidClasses = (size: "sm" | "md" | "lg") => {
    const baseClasses = {
      sm: "text-[clamp(1.25rem,1rem+2vw,1.5rem)]", // 20px to 24px
      md: "text-[clamp(1.5rem,1.25rem+2vw,2rem)]", // 24px to 32px
      lg: "text-[clamp(1.875rem,1.5rem+3vw,3rem)]" // 30px to 48px
    };

    return baseClasses[size];
  };

  return (
    <h1 
      className={cn(
        getFluidClasses(size),
        "font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text tracking-tight leading-[1.1]",
        className
      )}
    >
      {children}
    </h1>
  );
}
