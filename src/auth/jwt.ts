import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js'; 

interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: string;
  designation?: string|undefined;   
}

interface RefreshTokenPayload {
  id: string;
}

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-key';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';

const ACCESS_TOKEN_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION as jwt.SignOptions["expiresIn"] | undefined;
const REFRESH_TOKEN_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION as jwt.SignOptions["expiresIn"] | undefined;

export const signAccessToken = (user: UserPayload): string => {
  return jwt.sign(
    user,
    ACCESS_TOKEN_SECRET,
    {
      ...(ACCESS_TOKEN_EXPIRATION ? { expiresIn: ACCESS_TOKEN_EXPIRATION } : {})
    }
  );
};

export const signRefreshToken = (user: UserPayload): string => {
  const payload: RefreshTokenPayload = { id: user.id };
  return jwt.sign(
    payload,
    REFRESH_TOKEN_SECRET,
    {
      ...(REFRESH_TOKEN_EXPIRATION ? { expiresIn: REFRESH_TOKEN_EXPIRATION } : {})
    }
  );
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
    return decoded;
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }
};
