import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateStoryContent({
  childName,
  childAge,
  mainCharacter,
  theme,
  previousContent = "",
}) {
  const prompt = previousContent
    ? `Continue the following children's story about ${childName} and ${mainCharacter}, maintaining the same style and theme. Previous content: ${previousContent}`
    : `Create a short, engaging children's story (maximum 1 minute reading time) about a child named ${childName} (age ${childAge}) and their friend ${mainCharacter}. The story should have a ${theme} theme and be appropriate for young children.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a skilled children's story writer. Create engaging, age-appropriate content with clear scene descriptions for illustration.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content);
}

export async function generateImage(sceneDescription: string) {
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: `Create a child-friendly, storybook-style illustration of: ${sceneDescription}. Use soft colors and a warm, comforting style suitable for bedtime stories.`,
    n: 1,
    size: "1024x1024",
    quality: "standard",
  });

  return response.data[0].url;
}

export async function generateSpeech(text: string) {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  
  // In a real implementation, you would save this to a file storage service
  // For this example, we'll return a mock URL
  return `/api/audio/${Date.now()}.mp3`;
}
