import OpenAI from "openai";
import { saveAudioFile } from './audio-storage';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface StoryGenerationParams {
  childName: string;
  childAge: number;
  mainCharacter: string;
  theme: string;
  previousContent?: string;
}

interface Character {
  name: string;
  description: string;
}

interface Setting {
  name: string;
  description: string;
}

interface Scene {
  text: string;
  description: string;
}

interface StoryContent {
  title: string;
  characters: Character[];
  settings: Setting[];
  scenes: Scene[];
  error?: string;
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
    const systemPrompt = `You are a skilled children's story writer. Create engaging, age-appropriate content in JSON format with the following structure. Do not add extra characters or delimiters like ** or ## in the output.

{
  "title": "Your title here",
  "characters": [
    {
      "name": "Character name",
      "description": "Detailed description of the character including appearance, attire, personality traits, relationships"
    }
    // Add more characters as needed
  ],
  "settings": [
    {
      "name": "Setting name",
      "description": "Detailed description of the setting including environment, atmosphere, visual elements"
    }
    // Add more settings as needed
  ],
  "scenes": [
    {
      "text": "Scene 1 text",
      "description": "Scene 1 description for illustration that highlights the key event of the scene, including characters and settings involved"
    },
    {
      "text": "Scene 2 text",
      "description": "Scene 2 description for illustration that highlights the key event of the scene, including characters and settings involved"
    },
    {
      "text": "Scene 3 text",
      "description": "Scene 3 description for illustration that highlights the key event of the scene, including characters and settings involved"
    }
  ]
}

Ensure that:

- Each scene's text is of sufficient length so that when read aloud, it lasts around 30 seconds to 1 minute.
- Each scene's description includes the relevant characters and settings to maintain consistency across illustrations.
- The output is valid JSON, without any missing elements or errors.`;

    const prompt = previousContent
      ? `Continue the following children's story about ${childName} and ${mainCharacter}, maintaining the same style and theme. Previous content: ${previousContent}`
      : `Create an engaging children's story about ${childName} (age ${childAge}) and following main characters and things ${mainCharacter}. 
         The story should have following main theme. 
         Theme: ${theme}
         Requirements:
         - Divide the story into 3 distinct scenes
         - Each scene's text should be long enough to last around 30 seconds to 1 minute when read aloud
         - Include dialogue and character interactions
         - Add emotional cues for narration
         - Create vivid, illustration-friendly scenes
         - Keep each scene engaging
         - Ensure age-appropriate content and vocabulary
         - Include a clear beginning, middle, and end`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
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

    console.log('AI Response Content:', content);

    // Parse the JSON content
    let parsedContent: StoryContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse JSON from AI response:', parseError);
      throw new Error('Story generation failed: Invalid JSON format');
    }

    // Validate the parsed content
    if (
      !parsedContent.title ||
      !parsedContent.characters ||
      !parsedContent.settings ||
      !parsedContent.scenes ||
      parsedContent.scenes.length !== 3
    ) {
      console.error('Invalid story content structure:', parsedContent);
      throw new Error('Story generation failed: Missing or invalid story elements');
    }

    // Optionally, verify that each scene's text is long enough
    const wordsPerMinute = 130; // Average speaking rate for children
    const minWords = (30 / 60) * wordsPerMinute; // Minimum words for 30 seconds
    const maxWords = (60 / 60) * wordsPerMinute; // Maximum words for 1 minute

    for (let i = 0; i < parsedContent.scenes.length; i++) {
      const scene = parsedContent.scenes[i];
      const wordCount = scene.text.split(/\s+/).length;
      if (wordCount < minWords || wordCount > maxWords) {
        console.warn(`Scene ${i + 1} text length (${wordCount} words) is outside the desired range.`);
        // Optionally, you can adjust the scene text or request a regeneration
      }
    }

    // Log story content with safe access to potentially undefined values
    console.log('Successfully generated story content:', { 
      title: parsedContent.title,
      numberOfScenes: parsedContent.scenes.length,
      preview: parsedContent.scenes[0]?.text ? 
        (parsedContent.scenes[0].text.substring(0, 100) + '...') : 
        'No preview available',
      firstSceneDescription: parsedContent.scenes[0]?.description ? 
        (parsedContent.scenes[0].description.substring(0, 100) + '...') : 
        'No description available'
    });

    return parsedContent;
  } catch (error) {
    console.error('Error in story content generation:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? (error as Error).stack : undefined
    });
    throw new Error('Failed to generate story content: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

export async function generateImage(sceneDescription: string): Promise<string> {
  try {
    // Sanitize and limit scene description
    const sanitizedDescription = sceneDescription
      .replace(/[^\w\s,.()'"-]/g, '') // Remove special characters except basic punctuation
      .trim()
      .substring(0, 1500); // Increase limit to accommodate additional details

    // Enhance prompt with child-friendly context
    const safePrompt = `Create a cheerful, child-friendly storybook illustration with the following scene:
${sanitizedDescription}
Style guidelines:
- Use bright, warm colors suitable for children's books
- Keep the imagery gentle and non-threatening
- Avoid any scary or adult themes
- Focus on cute, cartoon-style characters
- Include soft lighting and friendly expressions
- Make it suitable for ages 2-12`;

    console.log('Generating image with sanitized prompt:', {
      originalLength: sceneDescription.length,
      sanitizedLength: sanitizedDescription.length,
      promptPreview: safePrompt
    });

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: safePrompt,
      n: 1,
      size: "1792x1024",
      quality: "standard",
      style: "natural",
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
      stack: error instanceof Error ? (error as Error).stack : undefined
    });
    // Return fallback image URL instead of throwing
    return '/assets/fallback-story-image.png';
  }
}

export async function generateSpeech(text: string): Promise<string> {
  try {
    console.log('Generating speech for text:', text.substring(0, 100) + '...');

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text
    });

    if (!mp3) {
      console.error('OpenAI returned empty response for speech generation');
      throw new Error("No audio data received from OpenAI");
    }

    const buffer = Buffer.from(await mp3.arrayBuffer());
    if (!buffer || buffer.length === 0) {
      console.error('Received empty buffer from OpenAI speech generation');
      throw new Error("Invalid audio data received");
    }

    // Save the audio file and get its URL
    const audioUrl = await saveAudioFile(buffer);
    console.log('Successfully saved audio file:', audioUrl);

    return audioUrl;
  } catch (error) {
    console.error("OpenAI Speech Generation Error:", {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? (error as Error).stack : undefined
    });
    throw new Error('Failed to generate speech: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}
