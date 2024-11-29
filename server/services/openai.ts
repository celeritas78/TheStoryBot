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

interface Scene {
  text: string;
  description: string;
}

interface StoryContent {
  title: string;
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
    const systemPrompt = `You are a skilled children's story writer. Create engaging, age-appropriate content with the following structure:

[TITLE]
Create a captivating, child-friendly title that reflects the story's theme and main characters.

[STORY]
Write the main story text here, divided into 3 scenes. Each scene should be clearly marked with [Scene 1], [Scene 2], [Scene 3].
Include narration cues in brackets like [excited], [whisper], [pause] to guide the storytelling.
Use clear paragraph breaks and engaging dialogue.
Do not add extra characters like ** or ## in the output.

[SCENE DESCRIPTIONS]
For each scene, provide a detailed description for illustration, marked as [Scene 1 Description], [Scene 2 Description], [Scene 3 Description].
The illustration description should highlight the key elements of the scene, such as characters, settings, action, and themes.
Focus on visual elements, colors, expressions, and composition.
Ensure descriptions are vivid and specific for image generation.`;

    const prompt = previousContent
      ? `Continue the following children's story about ${childName} and ${mainCharacter}, maintaining the same style and theme. Previous content: ${previousContent}`
      : `Create an engaging children's story about ${childName} (age ${childAge}) and their friend ${mainCharacter}. 
         Theme: ${theme}
         Requirements:
         - Divide the story into 3 distinct scenes
         - Include dialogue and character interactions
         - Add emotional cues for narration
         - Create vivid, illustration-friendly scenes
         - Keep each scene brief but engaging
         - Ensure age-appropriate content and vocabulary
         - Include a clear beginning, middle, and end`;

    console.log('Sending request to OpenAI with prompt:', {
      systemPrompt: systemPrompt.substring(0, 100) + '...',
      userPrompt: prompt.substring(0, 100) + '...'
    });

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

    console.log('Received raw response from OpenAI:', {
      id: response.id,
      model: response.model,
      usage: response.usage,
      choices: response.choices?.length
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
    console.log('Raw content from OpenAI:', content);
    // Parse the content into title and scenes
    const scenes: Scene[] = [];
    
    // Extract title from ** markers with fallback
    let title: string;
    const titleMatch = content.match(/\*\*(.*?)\*\*/);
    if (!titleMatch) {
      console.warn('Title markers not found, attempting alternative title extraction');
      // Try to extract first line as title
      const firstLine = content.split('\n')[0].trim();
      if (firstLine && firstLine.length < 100) {
        title = firstLine;
      } else {
        console.warn('No suitable title found in content, generating fallback');
        title = `${childName}'s ${theme.charAt(0).toUpperCase() + theme.slice(1)} Adventure`;
      }
    } else {
      title = titleMatch[1].trim();
    }

    console.log('Extracted title:', { title, fromMarkers: !!titleMatch });

    if (!title) {
      console.error('Failed to generate title');
      throw new Error('Story generation failed: Could not create title');
    }
    
    // Extract scenes and descriptions directly
    const scenes: Scene[] = [];
    const sceneMatches = content.matchAll(/\[Scene (\d+)\]([\s\S]*?)(?=\[Scene \d+\]|$)/g);
    const descriptionMatches = content.matchAll(/\[Scene (\d+) Description\]([\s\S]*?)(?=\[Scene \d+ Description\]|$)/g);
    
    // Convert matches to arrays for easier processing
    const sceneArray = Array.from(sceneMatches);
    const descriptionArray = Array.from(descriptionMatches);

    console.log('Found scenes and descriptions:', {
      sceneCount: sceneArray.length,
      descriptionCount: descriptionArray.length
    });

    if (sceneArray.length === 0) {
      console.error('No scenes found in content');
      throw new Error('Story generation failed: No scenes found');
    }

    const storyText = sceneArray.map(match => match[2].trim()).join('\n\n');
    const descriptions = descriptionArray.map(match => match[2].trim()).join('\n\n');
    
    console.log('Successfully parsed story sections:', {
      storyTextPreview: storyText.substring(0, 100) + '...',
      descriptionsPreview: descriptions.substring(0, 100) + '...'
    });
    
    // Validate we have both story text and descriptions
    if (!storyText.trim() || !descriptions.trim()) {
      throw new Error('Story generation failed: Missing required content sections');
    }

    // Extract individual scenes and their descriptions
    for (let i = 1; i <= 3; i++) {
      const sceneRegex = new RegExp(`\\[Scene ${i}\\]([\\s\\S]*?)(?=\\[Scene ${i + 1}\\]|$)`);
      const descRegex = new RegExp(`\\[Scene ${i} Description\\]([\\s\\S]*?)(?=\\[Scene ${i + 1} Description\\]|$)`);
      
      const sceneMatch = storyText.match(sceneRegex);
      const descMatch = descriptions.match(descRegex);

      if (!sceneMatch || !descMatch) {
        console.error(`Failed to extract scene ${i}`);
        throw new Error(`Story generation failed: Missing scene ${i}`);
      }

      const rawText = sceneMatch[1].trim();
      const description = descMatch[1].trim();

      // Clean the text by removing any remaining description markers and clean up spacing
      const text = rawText
        .replace(/\[.*?\]/g, '') // Remove any remaining markers
        .replace(/\s+/g, ' ')    // Normalize spaces
        .trim();

      if (!text || !description) {
        console.error(`Empty content in scene ${i}`);
        throw new Error(`Story generation failed: Empty content in scene ${i}`);
      }

      scenes.push({ 
        text,           // Clean narrative text for audio/display
        description     // Separate description for image generation
      });
    }

    if (scenes.length === 0) {
      throw new Error('Story generation failed: No valid scenes found');
    }

    const parsedContent: StoryContent = {
      title,
      scenes
    };

    console.log('Successfully generated story content:', { 
      numberOfScenes: parsedContent.scenes.length,
      preview: parsedContent.scenes[0]?.text.substring(0, 100) + '...',
      firstSceneDescription: parsedContent.scenes[0]?.description.substring(0, 100) + '...'
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
    // Keep all relevant details from scene description
    const sanitizedDescription = sceneDescription
      .replace(/[^\w\s,.()'"-]/g, ' ') // Replace special characters with spaces
      .replace(/\s+/g, ' ')           // Normalize spaces
      .trim();

    // Enhance prompt with detailed style guidelines and scene-specific context
    const safePrompt = `Create a detailed, child-friendly storybook illustration for the following scene: ${sanitizedDescription}.
    
    Key elements to include:
    - All characters and objects mentioned in the scene
    - The specific setting and environment described
    - The emotional tone and atmosphere of the scene
    
    Artistic style requirements: 
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
      size: "1792x1024",
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
    console.log('Generating speech for text:', text.substring(0, 100) + '...');
    
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
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
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
