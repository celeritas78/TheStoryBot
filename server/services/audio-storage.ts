import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

export async function saveAudioFile(audioBuffer: Buffer): Promise<string> {
  const fileName = `${randomUUID()}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);
  
  await fs.promises.writeFile(filePath, audioBuffer);
  return `/audio/${fileName}`;
}

export function getAudioFilePath(fileName: string): string {
  return path.join(AUDIO_DIR, fileName);
}

export function audioFileExists(fileName: string): boolean {
  return fs.existsSync(path.join(AUDIO_DIR, fileName));
}
