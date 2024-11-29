import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

// Supported audio formats and their MIME types
export const SUPPORTED_AUDIO_FORMATS = {
  wav: 'audio/wav',  // Using WAV as our standard format for high quality audio
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

export async function saveAudioFile(audioBuffer: Buffer, format: string = 'wav'): Promise<string> {
  // Normalize format string
  const normalizedFormat = format.startsWith('.') ? format.slice(1) : format;
  const fileExtension = `.${normalizedFormat}`;
  
  // Validate format
  if (!isAudioFormatSupported(fileExtension)) {
    console.error(`Attempted to save unsupported audio format: ${format}`);
    throw new Error(`Unsupported audio format: ${format}. Supported formats are: ${Object.keys(SUPPORTED_AUDIO_FORMATS).join(', ')}`);
  }

  try {
    // Generate unique filename
    const fileName = `${randomUUID()}${fileExtension}`;
    const filePath = path.join(AUDIO_DIR, fileName);
    
    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file
    await fs.promises.writeFile(filePath, audioBuffer);
    console.log(`Successfully saved audio file: ${fileName}`);
    
    return `/audio/${fileName}`;
  } catch (error) {
    console.error('Failed to save audio file:', error);
    throw new Error(`Failed to save audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
