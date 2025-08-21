import { AppError } from './AppError.js';
import { AuthorRole, type MediaInput } from '../types/postApi.js';

export const validatePostContent = (content?: string, media?: any[]): void => {
  if (!content && (!media || media.length === 0)) {
    throw new AppError("Post must have content or media", 400);
  }
};

export const validateUserRole = (role: AuthorRole, allowedRoles: AuthorRole[]): void => {
  if (!allowedRoles.includes(role)) {
    throw new AppError(`Access denied. Required roles: ${allowedRoles.join(', ')}`, 403);
  }
};

export const validateRequiredFields = <T extends Record<string, any>>(
  fields: (keyof T)[],
  data: T
): void => {
  const missing = fields.filter(field => !data[field]);
  if (missing.length > 0) {
    throw new AppError(`Missing required fields: ${missing.join(', ')}`, 400);
  }
};

export const validateMediaStructure = (media: MediaInput[]): void => {
  for (const item of media) {
    validateRequiredFields<MediaInput>(['type', 'mime_type', 's3_key'], item);
  }
};