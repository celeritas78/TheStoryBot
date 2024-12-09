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
  childName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot be longer than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes"),
  childAge: z
    .string()
    .min(1, "Age is required")
    .transform((value) => {
      const num = Number(value);
      console.log("Transforming childAge to number:", num);
      return num;
    })
    .refine((n) => n >= 2 && n <= 12, "Age must be between 2 and 12 years"),
  mainCharacter: z
    .string()
    .min(2, "Character name must be at least 2 characters")
    .max(100, "Character name is too long")
    .regex(/^[a-zA-Z\s,()-]+$/, "Character name can only contain letters, spaces, commas, and basic punctuation"),
  theme: z
    .string()
    .min(1, "Please select a theme")
    .refine(
      (val) =>
        [
          "adventure",
          "animals",
          "art",
          "castles",
          "circus-adventures",
          "courage",
          "cultures",
          "dinosaurs",
          "discovery",
          "dreams",
          "environment",
          "everyday-magic",
          "exploration",
          "fairyland",
          "family",
          "fantasy",
          "farm-life",
          "festivals",
          "friendship",
          "heroes",
          "history",
          "imagination",
          "jungle-tales",
          "kindness",
          "legends",
          "magic",
          "music",
          "mystery",
          "mythical-creatures",
          "nature",
          "ocean",
          "pirates",
          "rainbows",
          "robots",
          "school-adventures",
          "science",
          "space",
          "sports",
          "superpowers",
          "talking-animals",
          "teamwork",
          "technology",
          "time-travel",
          "treasure",
          "underwater-worlds",
          "vehicles",
          "wizards",
        ].includes(val),
      "Invalid theme selected"
    ),
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

  const handleSubmit = (data: StoryFormData) => {
    console.log("Form submitted with data:", data);
    onSubmit(data);
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="childName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Child's Name (Main Character)</FormLabel>
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
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Theme</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      console.log("Theme selected:", value);
                      field.onChange(value);
                    }}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a theme" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[
                    "adventure",
                    "animals",
                    "art",
                    "castles",
                    "circus-adventures",
                    "courage",
                    "cultures",
                    "dinosaurs",
                    "discovery",
                    "dreams",
                    "environment",
                    "everyday-magic",
                    "exploration",
                    "fairyland",
                    "family",
                    "fantasy",
                    "farm-life",
                    "festivals",
                    "friendship",
                    "heroes",
                    "history",
                    "imagination",
                    "jungle-tales",
                    "kindness",
                    "legends",
                    "magic",
                    "music",
                    "mystery",
                    "mythical-creatures",
                    "nature",
                    "ocean",
                    "pirates",
                    "rainbows",
                    "robots",
                    "school-adventures",
                    "science",
                    "space",
                    "sports",
                    "superpowers",
                    "talking-animals",
                    "teamwork",
                    "technology",
                    "time-travel",
                    "treasure",
                    "underwater-worlds",
                    "vehicles",
                    "wizards",
                      ].map((theme) => (
                        <SelectItem key={theme} value={theme}>
                          {theme.charAt(0).toUpperCase() + theme.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mainCharacter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Characters, Objects, Events</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Princess Aurora, Ember the Dragon, Golden Key, The Hidden Passage..  "
                    />
                  </FormControl>
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
