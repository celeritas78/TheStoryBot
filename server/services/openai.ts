import OpenAI from "openai";
import fetch from "node-fetch";
import { saveAudioFile } from './audio-storage';
import { saveImageFile } from './image-storage';

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

// Global variables to store character and setting info for image generation consistency.
// In practice, you may want to handle this differently (e.g. passing as function params)
// or integrate into your overall application state management.
let globalCharacters: Character[] = [];
let globalSettings: Setting[] = [];

async function generateOutline({
  childName,
  childAge,
  mainCharacter,
  theme
}: StoryGenerationParams): Promise<string> {
  const outlineSystemPrompt = `You are a skilled children's story writer. You will first produce an OUTLINE ONLY for a story. Do not write the full story yet. The outline will be used to guide the final story generation.`;

  const outlineUserPrompt = `
I need a children's story outline for a ${childAge}-year-old child named ${childName}. The main character(s)/element(s) is(are) ${mainCharacter}. 
Theme: ${theme}

Requirements for the outline:
- The story should have a simple narrative arc: beginning, middle, end.
- Exactly 3 scenes. Each scene should be distinct and visually rich.
- Each scene should have a key event, setting, and emotional tone.
- Include short bullet points (2-4) per scene describing what happens.
- Include any relevant character actions, objects, or events that must appear.

Output format (JSON):
{
  "scenes": [
    {
      "scene_number": 1,
      "key_events": ["..."],
      "setting": "short description of setting",
      "characters_involved": ["list of character names"],
      "emotional_tone": "e.g. excited, curious"
    },
    {
      "scene_number": 2,
      ...
    },
    {
      "scene_number": 3,
      ...
    }
  ]
}`;

  const outlineResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: outlineSystemPrompt },
      { role: "user", content: outlineUserPrompt }
    ]
  });

  const outlineMessage = outlineResponse.choices[0]?.message?.content;
  if (!outlineMessage) {
    throw new Error('Failed to generate outline from the model.');
  }

  return outlineMessage;
}

async function generateFullStory({
  childName,
  childAge,
  mainCharacter,
  theme,
  outlineJSON,
  previousContent
}: StoryGenerationParams & { outlineJSON: string }): Promise<StoryContent> {
  const systemPrompt = `You are a skilled children's story writer. Create engaging, age-appropriate content in JSON format with the following structure. Do not add extra characters or delimiters like ** or ## in the output.

{
  "title": "Your title here",
  "characters": [
    {
      "name": "Character name",
      "description": "Detailed description of the character including appearance, attire, personality traits, relationships"
    },
    {
      "name": "Object name",
      "description": "Detailed description of the object including appearance, type, features"
    }
    // Add more as needed
  ],
  "settings": [
    {
      "name": "Setting name",
      "description": "Detailed description of the setting including environment, atmosphere, visual elements"
    },
    {
      "name": "Event name",
      "description": "Detailed description of the event including location, time, circumstances, and outcome"
    }
    // Add more as needed
  ],
  "scenes": [
    {
      "text": "Scene 1 text (30-60 seconds read time)",
      "description": "Scene 1 illustration description focusing on characters, setting, and key visuals"
    },
    {
      "text": "Scene 2 text (30-60 seconds read time)",
      "description": "Scene 2 illustration description focusing on characters, setting, and key visuals"
    },
    {
      "text": "Scene 3 text (30-60 seconds read time)",
      "description": "Scene 3 illustration description focusing on characters, setting, and key visuals"
    }
  ]
}

Ensure:
- The story is guided by the provided outline.
- Each scene text is sufficiently long, including dialogue, emotions, and actions.
- Age-appropriate language and content.
- Maintain consistency in characters and theme.
- Make the scenes easy to visualize for illustrations.
- Output is valid JSON without extra commentary.`;

  const prompt = previousContent
    ? `Continue the story with the same style and theme. Previous content: ${previousContent}`
    : `Create the full children's story about ${childName} (age ${childAge}) with the main character(s)/elements ${mainCharacter} as per the given outline. 
       Theme: ${theme}
       Outline to follow:
       ${outlineJSON}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
  });

  const message = response.choices[0]?.message;
  if (!message || !message.content) {
    console.error('Invalid response structure from OpenAI:', response);
    throw new Error("OpenAI response missing story content");
  }

  const content = message.content;
  let parsedContent: StoryContent;
  try {
    parsedContent = JSON.parse(content);
  } catch (parseError) {
    console.error('Failed to parse JSON from AI response:', parseError);
    throw new Error('Story generation failed: Invalid JSON format');
  }

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

  // Validate scene length
  const wordsPerMinute = 130; // Approx average
  const minWords = (30 / 60) * wordsPerMinute; 
  const maxWords = (60 / 60) * wordsPerMinute; 

  for (let i = 0; i < parsedContent.scenes.length; i++) {
    const scene = parsedContent.scenes[i];
    const wordCount = scene.text.split(/\s+/).length;
    if (wordCount < minWords || wordCount > maxWords) {
      console.warn(`Scene ${i + 1} word count (${wordCount}) is outside the desired range (approx 65-130 words).`);
    }
  }

  // Store the characters and settings globally for image generation
  globalCharacters = parsedContent.characters || [];
  globalSettings = parsedContent.settings || [];

  return parsedContent;
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
    // Step 1: Generate outline
    const outline = await generateOutline({ childName, childAge, mainCharacter, theme, previousContent });

    // Step 2: Generate full story using outline
    const fullStory = await generateFullStory({ childName, childAge, mainCharacter, theme, previousContent, outlineJSON: outline });

    console.log('Successfully generated story content:', { 
      title: fullStory.title,
      numberOfScenes: fullStory.scenes.length,
      preview: fullStory.scenes[0]?.text ? 
        (fullStory.scenes[0].text) : 
        'No preview available',
      firstSceneDescription: fullStory.scenes[0]?.description ? 
        (fullStory.scenes[0].description) : 
        'No description available'
    });

    return fullStory;
  } catch (error) {
    console.error('Error in story content generation:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error('Failed to generate story content: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

export async function generateImage(sceneDescription: string): Promise<string> {
  try {
    // Build a consistent character description string
    let characterDescriptions = '';
    for (const char of globalCharacters) {
      characterDescriptions += `${char.name}: ${char.description}\n`;
    }

    // Similarly, if you want to ensure settings are incorporated, you can do so:
    let settingDescriptions = '';
    for (const set of globalSettings) {
      settingDescriptions += `${set.name}: ${set.description}\n`;
    }

    const integratedDescription = `
Scene description:
${sceneDescription}

Characters and objects (for consistency across scenes):
${characterDescriptions}

Settings:
${settingDescriptions}
    `.trim();

    const validationPrompt = `
Given the following integrated description of the scene, characters, and settings:
${integratedDescription}

We need an image prompt that:
- Clearly describes the visual elements of this scene for a children's storybook illustration.
- Incorporates the key characters and their described appearances.
- Incorporates any important objects or settings details.
- Maintains a warm, bright, child-friendly illustration style.
- Emphasizes the characters' consistent appearances and the specified setting.
- Use a whimsical, age-appropriate style.

Output a single concise prompt (no JSON) that can be used for image generation.
    `;

    const validationResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an assistant that reformats scene descriptions into a single illustrative image prompt for a children's storybook." },
        { role: "user", content: validationPrompt }
      ]
    });

    const refinedPrompt = validationResponse.choices[0]?.message?.content;
    if (!refinedPrompt) {
      console.warn("No refined prompt from validation step, falling back to sceneDescription + characterDescriptions");
      return '/assets/fallback-story-image.png';
    }

    const finalPrompt = `${refinedPrompt}\n\nStyle guidelines:\n- Children's storybook illustration\n- Bright, warm colors\n- Cartoon-style characters, friendly expressions\n- Soft lighting, whimsical atmosphere\n- Age-appropriate for 2-12\n- No scary or adult themes\n- Use only mentioned characters, objects, and settings`.trim();

    console.log('Final image prompt:', finalPrompt);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      n: 1,
      size: "1792x1024",
      quality: "standard",
      style: "vivid",
    });

    if (!response.data?.[0]?.url) {
      console.warn('No image URL received from OpenAI, using fallback');
      return '/assets/fallback-story-image.png';
    }

    // Download and save the image locally
    try {
      const imageUrl = response.data[0].url;
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }
      
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const format = 'png'; // DALL-E 3 images are PNG format
      
      // Save the image using our image storage service
      const localImagePath = await saveImageFile(imageBuffer, format);
      console.log('Successfully saved image locally:', localImagePath);
      
      return localImagePath;
    } catch (downloadError) {
      console.error('Error downloading/saving image:', downloadError);
      return '/assets/fallback-story-image.png';
    }
  } catch (error) {
    console.error("OpenAI Image Generation Error:", {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
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
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error('Failed to generate speech: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}
