import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Configure audio storage directory
export const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Define supported audio formats
export const SUPPORTED_AUDIO_FORMATS = {
  'mp3': 'audio/mpeg',
  'm4a': 'audio/mp4',
  'wav': 'audio/wav'
} as const;

// Log audio directory configuration
//console.log('Audio directory configuration:', {
  //AUDIO_DIR,
  //exists: fs.existsSync(AUDIO_DIR),
  //files: fs.existsSync(AUDIO_DIR) ? fs.readdirSync(AUDIO_DIR) : []
//});

export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return SUPPORTED_AUDIO_FORMATS[ext as keyof typeof SUPPORTED_AUDIO_FORMATS] || 'audio/mpeg';
}

export function isAudioFormatSupported(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return ext in SUPPORTED_AUDIO_FORMATS;
}

export async function saveAudioFile(audioBuffer: Buffer, format: string = 'mp3'): Promise<string> {
  // Log input parameters
  console.log('saveAudioFile called with:', {
    bufferSize: audioBuffer.length,
    originalFormat: format,
    SUPPORTED_AUDIO_FORMATS
  });

  // Normalize format
  if (!format.startsWith('.')) {
    format = `.${format}`;
  }
  
  // Remove the dot for validation
  const formatWithoutDot = format.slice(1);
  
  // Validate format
  if (!(formatWithoutDot in SUPPORTED_AUDIO_FORMATS)) {
    console.error('Unsupported format error:', {
      format: formatWithoutDot,
      supportedFormats: SUPPORTED_AUDIO_FORMATS
    });
    throw new Error(`Unsupported audio format: ${format}`);
  }

  const fileName = `${randomUUID()}${format}`;
  const filePath = path.join(AUDIO_DIR, fileName);
  
  // Log file operations
  console.log('Saving audio file:', {
    fileName,
    filePath,
    exists: fs.existsSync(AUDIO_DIR)
  });
  
  await fs.promises.writeFile(filePath, audioBuffer);
  return `/audio/${fileName}`;
}

export function getAudioFilePath(fileName: string): string {
  return path.join(AUDIO_DIR, fileName);
}

export function audioFileExists(fileName: string): boolean {
  const filePath = path.join(AUDIO_DIR, fileName);
  return fs.existsSync(filePath) && isAudioFormatSupported(fileName);
}
