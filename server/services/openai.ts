import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface StoryGenerationParams {
  childName: string;
  childAge: number;
  mainCharacter: string;
  theme: string;
  previousContent?: string;
}

interface StoryContent {
  text: string;
  sceneDescription: string;
}

export async function generateStoryContent({
  childName,
  childAge,
  mainCharacter,
  theme,
  previousContent = "",
}: StoryGenerationParams): Promise<StoryContent> {
  console.log('Generating story content with params:', { childName, childAge, mainCharacter, theme, hasPreviousContent: !!previousContent });
  
  try {
    const prompt = previousContent
      ? `Continue the following children's story about ${childName} and ${mainCharacter}, maintaining the same style and theme. Previous content: ${previousContent}`
      : `Create a short, engaging children's story (maximum 1 minute reading time) about a child named ${childName} (age ${childAge}) and their friend ${mainCharacter}. The story should have a ${theme} theme and be appropriate for young children.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a skilled children's story writer. Create engaging, age-appropriate content. Format your response as follows:\n[Story Text]\n\nScene Description: [Description for illustration]"
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    if (!response.choices || !response.choices[0]) {
      console.error('Invalid response structure from OpenAI:', response);
      throw new Error("OpenAI response missing choices");
    }

    const message = response.choices[0].message;
    if (!message || !message.content) {
      console.error('Invalid message structure in OpenAI response:', response.choices[0]);
      throw new Error("OpenAI response missing message content");
    }

    const content = message.content;
    const parsedContent: StoryContent = {
      text: content.split('Scene Description:')[0].trim(),
      sceneDescription: content.split('Scene Description:')[1]?.trim() || ''
    };

    console.log('Successfully generated story content:', { 
      textLength: parsedContent.text.length,
      sceneDescriptionLength: parsedContent.sceneDescription.length,
      preview: parsedContent.text.substring(0, 100) + '...'
    });
    
    return parsedContent;
  } catch (error) {
    console.error('Error in story content generation:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error(`Failed to generate story content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateImage(sceneDescription: string): Promise<string> {
  try {
    // Sanitize and limit scene description
    const sanitizedDescription = sceneDescription
      .replace(/[^\w\s,.()'"-]/g, '') // Remove special characters except basic punctuation
      .trim()
      .substring(0, 500); // Limit length to 500 characters

    // Enhance prompt with child-friendly context
    const safePrompt = `Create a cheerful, child-friendly storybook illustration with the following scene: ${sanitizedDescription}. 
      Style guidelines:
      - Use bright, warm colors suitable for children's books
      - Keep the imagery gentle and non-threatening
      - Avoid any scary or adult themes
      - Focus on cute, cartoon-style characters
      - Include soft lighting and friendly expressions
      - Make it suitable for ages 3-10`;

    console.log('Generating image with sanitized prompt:', {
      originalLength: sceneDescription.length,
      sanitizedLength: sanitizedDescription.length,
      promptPreview: safePrompt.substring(0, 100) + '...'
    });

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: safePrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    if (!response.data?.[0]?.url) {
      console.warn('No image URL received from OpenAI, using fallback');
      return '/assets/fallback-story-image.png';
    }

    return response.data[0].url;
  } catch (error) {
    console.error("OpenAI Image Generation Error:", {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    // Return fallback image URL instead of throwing
    return '/assets/fallback-story-image.png';
  }
}

export async function generateSpeech(text: string): Promise<string> {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
    });

    if (!mp3) {
      throw new Error("No audio data received from OpenAI");
    }

    const buffer = Buffer.from(await mp3.arrayBuffer());
    if (!buffer || buffer.length === 0) {
      throw new Error("Invalid audio data received");
    }
    
    // In a real implementation, you would save this to a file storage service
    // For this example, we'll return a mock URL
    return `/api/audio/${Date.now()}.mp3`;
  } catch (error) {
    console.error("OpenAI Speech Generation Error:", error);
    throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
