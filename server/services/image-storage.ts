import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';

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

// Function to download image from URL
export async function downloadImage(url: string): Promise<Buffer> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000, // 10 second timeout
    });
    
    if (response.status !== 200) {
      throw new Error(`Failed to download image: HTTP ${response.status}`);
    }
    
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error downloading image:', error);
    throw new Error('Failed to download image from URL');
  }
}

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
  format: string = 'png',
  options: {
    maxSizeMB?: number;
    quality?: number;
  } = {}
): Promise<string> {
  const MAX_SIZE_MB = options.maxSizeMB || 5; // Default 5MB limit
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
  const quality = options.quality || 80; // Default quality

  // Log input parameters and validate buffer
  console.log('saveImageFile called with:', {
    bufferSize: imageBuffer.length,
    originalFormat: format,
    maxSizeMB: MAX_SIZE_MB,
    quality,
    SUPPORTED_IMAGE_FORMATS,
    timestamp: new Date().toISOString()
  });

  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Invalid or empty image buffer');
  }

  // Check file size
  if (imageBuffer.length > MAX_SIZE_BYTES) {
    const error = new Error(`Image size exceeds ${MAX_SIZE_MB}MB limit`);
    console.error('File size error:', {
      size: imageBuffer.length,
      maxSize: MAX_SIZE_BYTES,
      timestamp: new Date().toISOString()
    });
    throw error;
  }

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
      supportedFormats: SUPPORTED_IMAGE_FORMATS,
      timestamp: new Date().toISOString()
    });
    throw new Error(`Unsupported image format: ${format}. Supported formats: ${Object.keys(SUPPORTED_IMAGE_FORMATS).join(', ')}`);
  }

  try {
    // Ensure the image directory exists
    if (!fs.existsSync(IMAGE_DIR)) {
      await fs.promises.mkdir(IMAGE_DIR, { recursive: true });
      console.log('Created image directory:', IMAGE_DIR);
    }

    const fileName = `${randomUUID()}${format}`;
    const filePath = path.join(IMAGE_DIR, fileName);
    
    // Log file operations
    console.log('Saving image file:', {
      fileName,
      filePath,
      exists: fs.existsSync(IMAGE_DIR),
      timestamp: new Date().toISOString()
    });
    
    await fs.promises.writeFile(filePath, imageBuffer);
    
    // Verify file was written successfully
    const stats = await fs.promises.stat(filePath);
    if (stats.size === 0) {
      throw new Error('Written file is empty');
    }

    console.log('Image file saved successfully:', {
      fileName,
      filePath,
      size: stats.size,
      timestamp: new Date().toISOString()
    });
    
    const relativePath = `/images/${fileName}`;
    console.log('Returning image path:', relativePath);
    return relativePath;
  } catch (error) {
    console.error('Failed to save image:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    throw new Error('Failed to save image file. Please try again.');
  }
}

export function getImageFilePath(fileName: string): string {
  return path.join(IMAGE_DIR, fileName);
}

export function imageFileExists(fileName: string): boolean {
  const filePath = path.join(IMAGE_DIR, fileName);
  return fs.existsSync(filePath) && isImageFormatSupported(fileName);
}
