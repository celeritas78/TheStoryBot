import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

// Only support MP3 format for stability
export const SUPPORTED_AUDIO_FORMATS = {
  mp3: 'audio/mpeg',
} as const;

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return SUPPORTED_AUDIO_FORMATS[ext as keyof typeof SUPPORTED_AUDIO_FORMATS] || 'application/octet-stream';
}

export function isAudioFormatSupported(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return ext in SUPPORTED_AUDIO_FORMATS;
}

export async function saveAudioFile(audioBuffer: Buffer, format: string = 'mp3'): Promise<string> {
  if (!format.startsWith('.')) {
    format = `.${format}`;
  }
  
  if (!isAudioFormatSupported(format)) {
    throw new Error(`Unsupported audio format: ${format}`);
  }

  const fileName = `${randomUUID()}${format}`;
  const filePath = path.join(AUDIO_DIR, fileName);
  
  await fs.promises.writeFile(filePath, audioBuffer);
  return `/audio/${fileName}`;
}

export function getAudioFilePath(fileName: string): string {
  if (!isAudioFormatSupported(fileName)) {
    throw new Error(`Unsupported audio format: ${path.extname(fileName)}`);
  }
  return path.join(AUDIO_DIR, fileName);
}

export function audioFileExists(fileName: string): boolean {
  return fs.existsSync(path.join(AUDIO_DIR, fileName)) && isAudioFormatSupported(fileName);
}
