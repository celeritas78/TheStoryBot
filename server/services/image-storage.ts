import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Configure image storage directory
export const IMAGE_DIR = path.join(process.cwd(), 'public', 'images');

// Ensure image directory exists
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

// Define supported image formats
export const SUPPORTED_IMAGE_FORMATS = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'webp': 'image/webp'
} as const;

export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return SUPPORTED_IMAGE_FORMATS[ext as keyof typeof SUPPORTED_IMAGE_FORMATS] || 'image/png';
}

export function isImageFormatSupported(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase().slice(1);
  return ext in SUPPORTED_IMAGE_FORMATS;
}

export async function saveImageFile(
  imageBuffer: Buffer,
  format: string = 'png'
): Promise<string> {
  // Log input parameters
  console.log('saveImageFile called with:', {
    bufferSize: imageBuffer.length,
    originalFormat: format,
    SUPPORTED_IMAGE_FORMATS
  });

  // Normalize format
  if (!format.startsWith('.')) {
    format = `.${format}`;
  }
  
  // Remove the dot for validation
  const formatWithoutDot = format.slice(1);
  
  // Validate format
  if (!(formatWithoutDot in SUPPORTED_IMAGE_FORMATS)) {
    console.error('Unsupported format error:', {
      format: formatWithoutDot,
      supportedFormats: SUPPORTED_IMAGE_FORMATS
    });
    throw new Error(`Unsupported image format: ${format}`);
  }

  const fileName = `${randomUUID()}${format}`;
  const filePath = path.join(IMAGE_DIR, fileName);
  
  // Log file operations
  console.log('Saving image file:', {
    fileName,
    filePath,
    exists: fs.existsSync(IMAGE_DIR)
  });
  
  await fs.promises.writeFile(filePath, imageBuffer);
  return `/images/${fileName}`;
}

export function getImageFilePath(fileName: string): string {
  return path.join(IMAGE_DIR, fileName);
}

export function imageFileExists(fileName: string): boolean {
  const filePath = path.join(IMAGE_DIR, fileName);
  return fs.existsSync(filePath) && isImageFormatSupported(fileName);
}
