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
  console.log('--- LLM REQUEST START ---');
  messages.forEach((m, i) => {
    console.log(`Message ${i+1} [${m.role.toUpperCase()}]: ${m.content}`);
  });
  console.log('--- LLM REQUEST END ---');

  const response = await openai.chat.completions.create({
    model,
    messages
  });

  const msg = response.choices[0]?.message?.content;
  if (!msg) throw new Error("No response from LLM");

  console.log('--- LLM RESPONSE START ---');
  console.log(msg);
  console.log('--- LLM RESPONSE END ---');

  return msg;
}

/**
 * Utility function to clean the response of any markdown fences before parsing JSON.
 */
function cleanJSONResponse(response: string): string {
  let cleaned = response.trim();
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
- Each scene distinct, visually rich, and tied to a specific geographic/cultural location (e.g., a region or country) to ensure cohesive imagery
- Include references to ethnicity, cultural background, and local environmental details to enrich the story world
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
Given the outline below, define in detail all characters, objects, and settings that appear in the story. Add ethnicity, cultural background, local environmental/geographic details. Include consistent appearance traits (hair, clothing colors, etc.). Use short, keyword-based descriptions rather than full sentences.

Outline:
${JSON.stringify(outline, null, 2)}

Requirements:
- Include all characters mentioned, plus the mainCharacter(s).
- Add ethnicity, cultural cues, geography, environment details.
- Keep descriptions rich in detail but use keyword-based phrases.
- Output ONLY raw JSON, no code fences.

Format:
{
  "characters": [
    {
      "name": "...",
      "description": "skin_tone:..., hair:..., clothes:..., ethnicity:..., personality:..., location:... (keywords only)"
    }
    ...
  ],
  "objects": [
    {
      "name": "...",
      "description": "color:..., material:..., use:... (keywords only)"
    }
    ...
  ],
  "settings": [
    {
      "name": "...",
      "description": "geography:..., flora:..., fauna:..., climate:..., cultural_elements:... (keywords only)"
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
- Integrate ethnicity, location, cultural elements, and environment consistently.
- Emphasize visuals and emotions.
- 3 scenes, each about 30-60 seconds read time.
- Include dialogue, emotions, actions.
- Use a simple narrative arc.
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
`;

  const storyMsg = await callChatCompletion([
    {role: "system", content: systemPrompt},
    {role: "user", content: userPrompt}
  ]);

  const storyContent = cleanJSONResponse(storyMsg);
  const story: StoryContent = JSON.parse(storyContent);

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
  console.log('Extracting narration scripts...');
  return story.scenes.map(scene => scene.text);
}

async function extractKeyElementsFromScenes(story: StoryContent) {
  const systemPrompt = `You are an assistant who extracts key visual elements from scenes. Output ONLY raw JSON.`;
  const userPrompt = `
Given the following story scenes, list the key visual elements in each scene for illustration.
Use short keyword descriptors rather than full sentences.
No code fences, just raw JSON.

Story Scenes:
${JSON.stringify(story.scenes, null, 2)}

Format:
{
  "scenes": [
    {
      "scene_number": 1,
      "key_elements": ["keyword1", "keyword2", ...]
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

function createConsistentPromptPrefix(characters: Character[], settings: Setting[]): string {
  const characterLines = characters.map(c => `- ${c.name}: ${c.description}`).join('\n');
  const settingLines = settings.map(s => `- ${s.name}: ${s.description}`).join('\n');

  return `Style guidelines:
- children's storybook style
- vibrant colors, soft lighting, cartoonish
- use character details (age, ethnicity, skin_tone, hair, clothing) consistently each scene
- reflect cultural, geographic environment
- no adult themes
- max 2500 chars
- keywords, not full sentences
- cohesive with story details

Characters:
${characterLines}

Settings:
${settingLines}

Now create a descriptive illustration prompt with keywords only:
`;
}

async function createImagePromptForScene(
  sceneDescription: string, 
  characters: Character[], 
  settings: Setting[], 
  keyElements: string[]
): Promise<string> {
  const systemPrompt = `You format illustration prompts. Output ONLY raw text. No code blocks. Use keywords. Limit under 2500 characters.`;
  const prefix = createConsistentPromptPrefix(characters, settings);

  const userPrompt = `
${prefix}
Scene Description (summarize as keywords):
${sceneDescription}

Key Elements:
${keyElements.join(', ')}

Requirements:
- Include each character's age, ethnicity, skin_tone, hair, clothes as per character descriptions
- Use short keywords
- Reflect ethnicity, location, geography from story
- Keep total prompt under 2500 chars
- No long sentences, mostly keywords describing characters, setting, objects, mood
- Return only the final prompt text
`;

  const promptMsg = await callChatCompletion([
    {role: "system", content: systemPrompt},
    {role: "user", content: userPrompt}
  ]);

  return promptMsg.trim().slice(0, 2490); // just a safety cut
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
    console.log('--- GENERATING OUTLINE ---');
    const outline = await generateOutline({ childName, childAge, mainCharacter, theme });
    console.log('Generated Outline:', JSON.stringify(outline, null, 2));

    // Step 2: Define entities (characters, objects, settings)
    console.log('--- DEFINING ENTITIES ---');
    const entities = await defineEntities({ outline, childName, childAge, mainCharacter, theme });
    console.log('Generated Entities:', JSON.stringify(entities, null, 2));

    // Step 3: Generate full story
    console.log('--- GENERATING FULL STORY ---');
    const story = await generateFullStory({ outline, entities, childName, childAge, mainCharacter, theme });
    console.log('Generated Story:', JSON.stringify(story, null, 2));

    // Step 4: Extract narration scripts (optional)
    console.log('--- EXTRACTING NARRATION SCRIPTS ---');
    const scripts = await extractNarrationScripts(story);
    console.log('Extracted narration scripts:', scripts);

    // Step 5: Extract key elements for each scene
    console.log('--- EXTRACTING KEY ELEMENTS FROM SCENES ---');
    const elements = await extractKeyElementsFromScenes(story);
    console.log('Key scene elements:', JSON.stringify(elements, null, 2));

    // Step 6: For each scene, create a final image prompt
    console.log('--- CREATING IMAGE PROMPTS FOR EACH SCENE ---');
    for (let i = 0; i < story.scenes.length; i++) {
      console.log(`Scene ${i+1}: Original Description: `, story.scenes[i].description);
      const scene = story.scenes[i];
      const sceneElements = elements.scenes.find((s: any) => s.scene_number === i+1)?.key_elements || [];
      const imagePrompt = await createImagePromptForScene(scene.description, story.characters, story.settings, sceneElements);
      console.log(`Scene ${i+1}: Final Image Prompt: `, imagePrompt);
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
    console.log('--- GENERATING IMAGE ---');
    console.log('Image Prompt:', scenePrompt);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: scenePrompt,
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
      console.log('Received Image URL from OpenAI:', imageUrl);

      const imageBuffer = await downloadImage(imageUrl);
      console.log('Downloaded image buffer size:', imageBuffer.length);

      const localImagePath = await saveImageFile(imageBuffer, 'png', { 
        maxSizeMB: 10,
        quality: 90
      });

      console.log('Saved image locally at:', localImagePath);

      if (!localImagePath) {
        throw new Error('Failed to get local image path');
      }

      return localImagePath;
    } catch (downloadError) {
      console.error('Failed to process image:', {
        error: downloadError instanceof Error ? downloadError.message : 'Unknown error',
        stack: downloadError instanceof Error ? downloadError.stack : undefined
      });
      return '/assets/fallback-story-image.png';
    }
  } catch (error) {
    console.error("OpenAI Image Generation Error:", error);
    return '/assets/fallback-story-image.png';
  }
}

export async function generateSpeech(text: string): Promise<string> {
  console.log('--- GENERATING SPEECH ---');
  console.log('Speech Input Text:', text.substring(0, 200) + '...');
  try {
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
