import express from "express";
import jwt from 'jsonwebtoken';
import type { UserRole, AuthUser } from "../auth/types.js"; // Make sure path is correct
import { AppError } from "../utils/AppError.js"; // Make sure path is correct

interface DecodedUserPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  designation?: string;
  phone: string;
  iat: number;
  exp: number;
}

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-key';

/**
 * Verifies an access token.
 * @param token The access token to verify.
 * @returns The decoded payload of the token.
 */
export const verifyJwt = (token: string): DecodedUserPayload => {
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as DecodedUserPayload;
    return decoded;
  } catch (error) {
    // This will be caught by the authenticateJwt middleware
    throw new Error('Invalid or expired token');
  }
};


// Extend the Express Request type to include the user property
declare global {
  namespace Express {
    interface Request {
      // Use the AuthUser type for consistency
      user?: AuthUser;
    }
  }
}

/**
 * --- UPDATED MIDDLEWARE ---
 * Authenticates a user by verifying a JWT from either the Authorization header or a cookie.
 */
export function authenticateJwt(req: express.Request, res: express.Response, next: express.NextFunction) {
  let token: string | undefined;

  // 1. Check for token in Authorization header (for mobile/API clients)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // 2. If not in header, fall back to checking cookies (for web clients)
  else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }

  try {
    const payload = verifyJwt(token);
    
    
    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      phone: payload.phone,
      designation: payload.designation,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

/**
 * --- NO CHANGES NEEDED HERE ---
 * This middleware checks if the authenticated user has one of the allowed roles.
 * It works perfectly with the updated authenticateJwt function.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      // This case should ideally be caught by authenticateJwt first
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }
    next();
  };
}
