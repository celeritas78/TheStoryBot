// Server configuration
export const STORAGE_PATH = './storage';
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const SUPPORTED_IMAGE_FORMATS = ['png', 'jpg', 'jpeg', 'webp'];
export const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav', 'ogg'];

// Content moderation
export const MAX_STORY_LENGTH = 5000; // characters
export const MIN_STORY_LENGTH = 100; // characters
export const MAX_TITLE_LENGTH = 100;
export const MIN_TITLE_LENGTH = 3;

// API rate limiting
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = 100;

// Basic configuration
export const MAX_STORIES = 10;