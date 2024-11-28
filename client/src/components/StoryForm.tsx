import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoryFormData } from "../lib/api";

interface StoryFormProps {
  onSubmit: (data: StoryFormData) => void;
  isLoading: boolean;
}

const formSchema = z.object({
  childName: z.string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot be longer than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens and apostrophes"),
  childAge: z.string()
    .min(1, "Age is required")
    .transform(Number)
    .refine((n) => n >= 2 && n <= 12, "Age must be between 2 and 12 years"),
  mainCharacter: z.string()
    .min(2, "Character name must be at least 2 characters")
    .max(100, "Character name is too long")
    .regex(/^[a-zA-Z\s,()-]+$/, "Character name can only contain letters, spaces, commas, and basic punctuation"),
  theme: z.string()
    .min(1, "Please select a theme")
    .refine((val) => ['adventure', 'fantasy', 'friendship', 'nature'].includes(val), "Invalid theme selected"),
});

export default function StoryForm({ onSubmit, isLoading }: StoryFormProps) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      childName: "",
      childAge: "",
      mainCharacter: "",
      theme: "adventure",
    },
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl text-center font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-transparent bg-clip-text">
          Story Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="childName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Child's Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="childAge"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Age</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="2"
                      max="12"
                      placeholder="Enter age"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mainCharacter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Main Character</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Dragon, Princess, Wizard"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Theme</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a theme" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="adventure">Adventure</SelectItem>
                      <SelectItem value="fantasy">Fantasy</SelectItem>
                      <SelectItem value="friendship">Friendship</SelectItem>
                      <SelectItem value="nature">Nature</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Creating Story..." : "Generate Story"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
