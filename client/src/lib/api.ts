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
  title: string;
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

  // Import queryClient and invalidate stories cache
  const { queryClient } = await import('./queryClient');
  await queryClient.invalidateQueries({ queryKey: ['stories'] });

  return response.json();
}

export async function getAllStories() {
  console.log('Fetching all stories...');
  const response = await fetch(`${API_BASE}/stories`);
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API error:', error);
    throw new Error(error.message || 'Failed to fetch stories');
  }

  const stories = await response.json();
  console.log('Stories fetched:', stories.length);
  return stories;
}
