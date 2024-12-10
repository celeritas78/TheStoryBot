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

// Helper to handle API errors
async function handleApiError(response: Response): Promise<never> {
  let errorData;
  try {
    // Attempt to parse error as JSON
    errorData = await response.json();
  } catch (e) {
    // If JSON parsing fails, use text content
    const textContent = await response.text();
    throw new Error(textContent || `HTTP error ${response.status}`);
  }
  
  throw new Error(errorData.error || 'Unknown API error');
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export async function generateStory(formData: StoryFormData): Promise<Story> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/stories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        await handleApiError(response);
      }

      // Parse response
      let data: Story;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error('Invalid JSON response from server');
      }

      // Import queryClient and invalidate stories cache
      const { queryClient } = await import('./queryClient');
      await queryClient.invalidateQueries({ queryKey: ['stories'] });

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Only retry on network errors or 5xx server errors
      const shouldRetry = 
        error instanceof TypeError || // Network error
        (lastError.message.includes('HTTP error 5')); // 5xx error
      
      if (!shouldRetry || attempt === MAX_RETRIES - 1) {
        throw lastError;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
      console.log(`Retrying request (attempt ${attempt + 2}/${MAX_RETRIES})...`);
    }
  }

  throw lastError || new Error('Failed to generate story after all retries');
}

export async function getAllStories() {
  console.log('Fetching user stories...');
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/stories`, {
        headers: {
          "Accept": "application/json",
        },
        credentials: 'include', // Include credentials for authentication
      });

      if (!response.ok) {
        await handleApiError(response);
      }

      let stories: Story[];
      try {
        stories = await response.json();
      } catch (e) {
        throw new Error('Invalid JSON response from server');
      }

      console.log('Stories fetched:', stories.length);
      return stories;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const shouldRetry = 
        error instanceof TypeError || 
        (lastError.message.includes('HTTP error 5'));
      
      if (!shouldRetry || attempt === MAX_RETRIES - 1) {
        throw lastError;
      }
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
      console.log(`Retrying request (attempt ${attempt + 2}/${MAX_RETRIES})...`);
    }
  }

  throw lastError || new Error('Failed to fetch stories after all retries');
}

// Credit-related types and functions
export interface CreditBalance {
  credits: number;
  isPremium: boolean;
}

export interface PaymentIntent {
  clientSecret: string;
  transactionId: number;
}

export async function getCreditBalance(): Promise<CreditBalance> {
  const response = await fetch(`${API_BASE}/credits/balance`, {
    headers: {
      "Accept": "application/json",
    },
    credentials: 'include',
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  return response.json();
}

export async function purchaseCredits(amount: number): Promise<PaymentIntent> {
  const response = await fetch(`${API_BASE}/credits/purchase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    credentials: 'include',
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  return response.json();
}

export async function confirmCreditPurchase(paymentIntentId: string): Promise<CreditBalance> {
  const response = await fetch(`${API_BASE}/credits/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    credentials: 'include',
    body: JSON.stringify({ paymentIntentId }),
  });

  if (!response.ok) {
    await handleApiError(response);
  }

  return response.json();
}