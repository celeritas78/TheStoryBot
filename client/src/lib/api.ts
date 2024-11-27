import { z } from "zod";

const API_BASE = "/api";

export interface StoryFormData {
  childName: string;
  childAge: string;
  mainCharacter: string;
  theme: string;
}

export interface StorySegment {
  content: string;
  imageUrl: string;
  audioUrl: string;
}

export interface Story {
  id: number;
  childName: string;
  theme: string;
  segments: Array<{
    content: string;
    imageUrl: string;
    audioUrl: string;
  }>;
  firstSegment?: {
    imageUrl: string;
    content: string;
    audioUrl: string;
  };
}

export async function generateStory(formData: StoryFormData): Promise<Story> {
  const response = await fetch(`${API_BASE}/stories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('API error:', error);
    throw new Error(error.message || 'Failed to generate story');
  }

  return response.json();
}

export async function getAllStories() {
  const response = await fetch(`${API_BASE}/library`);
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API error:', error);
    throw new Error(error.message || 'Failed to fetch stories');
  }

  return response.json();
}
