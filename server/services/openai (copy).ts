import OpenAI from "openai";
import { saveAudioFile } from './audio-storage';
import { downloadImage, saveImageFile } from './image-storage';

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

interface OutlineScene {
  scene_number: number;
  key_events: string[];
  setting: string;
  characters_involved: string[];
  emotional_tone: string;
}

interface OutlineJSON {
  scenes: OutlineScene[];
}

async function callChatCompletion(messages: {role: 'system'|'user', content: string}[], model="gpt-4o-mini") {
  const response = await openai.chat.completions.create({
    model,
    messages
  });
  const msg = response.choices[0]?.message?.content;
  if (!msg) throw new Error("No response from LLM");
  return msg;
}

/**
 * Utility function to clean the response of any markdown fences before parsing JSON.
 */
function cleanJSONResponse(response: string): string {
  let cleaned = response.trim();
  // Remove triple backticks and possible language hints like ```json
  cleaned = cleaned.replace(/^```(\w+)?/gm, '').replace(/```$/gm, '');
  return cleaned.trim();
}

async function generateOutline({
  childName,
  childAge,
  mainCharacter,
  theme
}: StoryGenerationParams): Promise<OutlineJSON> {
  const systemPrompt = `You are a skilled children's story planner. Do not use Markdown code blocks in your response. Output ONLY raw JSON.`;
  const userPrompt = `
I need a children's story outline for a ${childAge}-year-old child named ${childName}. The main character(s)/element(s) is(are) ${mainCharacter}.
Theme: ${theme}

Requirements for the outline:
- Exactly 3 scenes: beginning, middle, end
- Each scene distinct and visually rich
- Each scene has key_events, setting, characters_involved, and emotional_tone
- Output ONLY raw JSON, no Markdown or code blocks.

Format:
{
  "scenes": [
    {
      "scene_number": 1,
      "key_events": ["..."],
      "setting": "short description",
      "characters_involved": ["..."],
      "emotional_tone": "..."
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
}
  `;

  const outlineMsg = await callChatCompletion([
    {role: "system", content: systemPrompt},
    {role: "user", content: userPrompt}
  ]);

  const outlineContent = cleanJSONResponse(outlineMsg);
  const outlineJSON: OutlineJSON = JSON.parse(outlineContent);
  return outlineJSON;
}

async function defineEntities({
  outline,
  childName,
  childAge,
  mainCharacter,
  theme
}: {outline: OutlineJSON} & StoryGenerationParams) {
  const systemPrompt = `You are a skilled children's story writer. Define all entities in detail. Do not use Markdown code blocks. Output ONLY raw JSON.`;

  const userPrompt = `
Given the outline below, define in detail all characters, objects, and settings that appear in the story. Include appearance, personality traits, relationships.

Outline:
${JSON.stringify(outline, null, 2)}

Requirements:
- Include all characters mentioned in the outline and mainCharacter(s) if separate.
- Include objects/events if applicable.
- Include settings in detail.
- Output ONLY raw JSON, no code fences.

Format:
{
  "characters": [
    {
      "name": "...",
      "description": "..."
    }
    ...
  ],
  "objects": [
    {
      "name": "...",
      "description": "..."
    }
    ...
  ],
  "settings": [
    {
      "name": "...",
      "description": "..."
    }
    ...
  ]
}`;

  const entitiesMsg = await callChatCompletion([
    {role: "system", content: systemPrompt},
    {role: "user", content: userPrompt}
  ]);

  const entitiesContent = cleanJSONResponse(entitiesMsg);
  const entities = JSON.parse(entitiesContent);
  return entities;
}

async function generateFullStory({
  outline,
  entities,
  childName,
  childAge,
  mainCharacter,
  theme
}: {outline: OutlineJSON, entities: any} & StoryGenerationParams): Promise<StoryContent> {
  const systemPrompt = `You are a skilled children's story writer. Create a full 3-scene story. Do not use Markdown code blocks. Output ONLY raw JSON.`;

  const userPrompt = `
Using the outline and entities defined below, create a full children's story in 3 scenes.

Outline:
${JSON.stringify(outline, null, 2)}

Entities:
${JSON.stringify(entities, null, 2)}

Requirements:
- Age-appropriate language
- Integrate all characters, objects, and settings
- 3 scenes, each 30-60 seconds read time
- Include dialogue, emotions, actions
- Output ONLY raw JSON, no code fences.

Format:
{
  "title": "...",
  "characters": [...],
  "settings": [...],
  "scenes": [
    {
      "text": "...",
      "description": "..."
    },
    {
      "text": "...",
      "description": "..."
    },
    {
      "text": "...",
      "description": "..."
    }
  ]
}
Use the previously defined characters and settings for consistency.
`;

  const storyMsg = await callChatCompletion([
    {role: "system", content: systemPrompt},
    {role: "user", content: userPrompt}
  ]);

  const storyContent = cleanJSONResponse(storyMsg);
  const story: StoryContent = JSON.parse(storyContent);

  // Merge objects into characters if needed
  const mergedCharacters = [...story.characters];
  if (entities.objects && Array.isArray(entities.objects)) {
    for (const obj of entities.objects) {
      mergedCharacters.push(obj);
    }
  }

  const mergedSettings = entities.settings || story.settings || [];

  story.characters = mergedCharacters;
  story.settings = mergedSettings;

  return story;
}

async function extractNarrationScripts(story: StoryContent) {
  // Scenes' text are already narration.
  return story.scenes.map(scene => scene.text);
}

async function extractKeyElementsFromScenes(story: StoryContent) {
  const systemPrompt = `You are an assistant who extracts key visual elements from scenes. Do not use Markdown code blocks. Output ONLY raw JSON.`;
  const userPrompt = `
Given the following story scenes, list the key visual elements in each scene for illustration.

Story Scenes:
${JSON.stringify(story.scenes, null, 2)}

Output ONLY raw JSON:

{
  "scenes": [
    {
      "scene_number": 1,
      "key_elements": ["..."]
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

  const elementsMsg = await callChatCompletion([
    {role: "system", content: systemPrompt},
    {role: "user", content: userPrompt}
  ]);

  const elementsContent = cleanJSONResponse(elementsMsg);
  const elements = JSON.parse(elementsContent);
  return elements;
}

/**
 * Create a stable prefix that includes style guidelines and references to characters and settings.
 * This ensures consistency across all generated images.
 */
function createConsistentPromptPrefix(characters: Character[], settings: Setting[]): string {
  // Summarize characters
  const characterLines = characters.map(c => `- ${c.name}: ${c.description}`).join('\n');

  // Summarize settings
  const settingLines = settings.map(s => `- ${s.name}: ${s.description}`).join('\n');

  // Keep instructions concise (under ~200 words total prompt)
  // Focus on key recurring instructions and details.
  return `Style guidelines:
- Children's storybook illustration
- Bright, warm colors
- Cartoon-style characters, friendly expressions
- Soft lighting, whimsical atmosphere
- Suitable for ages 2-12
- No scary or adult themes
- Ensure visual consistency across all scenes of this story.

Characters:
${characterLines}

Settings:
${settingLines}

Use these references to maintain consistent appearances and atmosphere. Now describe the scene below in a single illustration prompt that includes the listed key elements:`;
}

async function createImagePromptForScene(
  sceneDescription: string, 
  characters: Character[], 
  settings: Setting[], 
  keyElements: string[]
): Promise<string> {
  const systemPrompt = `You format illustration prompts. Output ONLY raw text. No code blocks.`;

  // Create a stable prefix with style and entity details
  const prefix = createConsistentPromptPrefix(characters, settings);

  const userPrompt = `
${prefix}

Key Elements:
${keyElements.join(', ')}

Scene Description:
${sceneDescription}

Requirements:
- Produce a single descriptive prompt capturing all details for a cohesive illustration.
- Include relevant characters, setting details, and key elements.
- Keep the prompt under 200 words, no code blocks, just descriptive text.
  `;

  const promptMsg = await callChatCompletion([
    {role: "system", content: systemPrompt},
    {role: "user", content: userPrompt}
  ]);

  return promptMsg.trim();
}

export async function generateStoryContent({
  childName,
  childAge,
  mainCharacter,
  theme,
  previousContent = "",
}: StoryGenerationParams): Promise<StoryContent> {
  console.log('Generating story with improved flow:', { childName, childAge, mainCharacter, theme });

  try {
    // Step 1: Generate outline
    const outline = await generateOutline({ childName, childAge, mainCharacter, theme });

    console.log('Generating Outline:', outline);

    // Step 2: Define entities (characters, objects, settings)
    const entities = await defineEntities({ outline, childName, childAge, mainCharacter, theme });

    console.log('Generating entities:', entities);

    // Step 3: Generate full story
    const story = await generateFullStory({ outline, entities, childName, childAge, mainCharacter, theme });

    console.log('Generating story:', story);

    // Step 4: Extract narration scripts (optional)
    const scripts = await extractNarrationScripts(story);
    console.log('Extracted narration scripts:', scripts.map(s => s.substring(0, 1000) + '...'));

    // Step 5: Extract key elements for each scene
    const elements = await extractKeyElementsFromScenes(story);
    console.log('Key scene elements:', elements);

    // Step 6: For each scene, create a final image prompt
    for (let i = 0; i < story.scenes.length; i++) {
      const scene = story.scenes[i];
      const sceneElements = elements.scenes.find((s: any) => s.scene_number === i+1)?.key_elements || [];
      const imagePrompt = await createImagePromptForScene(scene.description, story.characters, story.settings, sceneElements);
      // Replace scene description with the final image prompt
      scene.description = imagePrompt;
    }

    console.log('Successfully generated story content with enriched prompts.');

    return story;
  } catch (error) {
    console.error('Error in improved story generation flow:', error);
    throw error;
  }
}

export async function generateImage(scenePrompt: string): Promise<string> {
  try {
    // We already included style guidelines in the prompt, but adding them again at runtime won't hurt.
    const finalPrompt = scenePrompt; 

    console.log('Generating image with prompt:', finalPrompt);

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

    try {
      const imageUrl = response.data[0].url;
      console.log('Generating image from OpenAI:', {
        imageUrl,
        timestamp: new Date().toISOString()
      });

      const imageBuffer = await downloadImage(imageUrl);
      console.log('Downloaded image buffer:', {
        size: imageBuffer.length,
        timestamp: new Date().toISOString()
      });

      const localImagePath = await saveImageFile(imageBuffer, 'png', { 
        maxSizeMB: 10,
        quality: 90
      });

      console.log('Saved image locally:', {
        localImagePath,
        timestamp: new Date().toISOString()
      });

      if (!localImagePath) {
        throw new Error('Failed to get local image path');
      }

      return localImagePath;
    } catch (downloadError) {
      console.error('Failed to process image:', {
        error: downloadError instanceof Error ? downloadError.message : 'Unknown error',
        stack: downloadError instanceof Error ? downloadError.stack : undefined,
        timestamp: new Date().toISOString()
      });
      return '/assets/fallback-story-image.png';
    }
  } catch (error) {
    console.error("OpenAI Image Generation Error:", error);
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

    const audioUrl = await saveAudioFile(buffer);
    console.log('Successfully saved audio file:', audioUrl);

    return audioUrl;
  } catch (error) {
    console.error("OpenAI Speech Generation Error:", error);
    throw new Error('Failed to generate speech: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}
