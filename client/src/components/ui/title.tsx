import { cn } from "@/lib/utils";

interface TitleProps {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Title({ children, className, size = "lg" }: TitleProps) {
  const sizeClasses = {
    sm: "text-xl md:text-2xl",
    md: "text-2xl md:text-3xl",
    lg: "text-3xl md:text-5xl"
  };

  return (
    <h1 
      className={cn(
        sizeClasses[size],
        "font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text",
        className
      )}
    >
      {children}
    </h1>
  );
}
