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


export const verifyJwt = (token: string): DecodedUserPayload => {
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as DecodedUserPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};


declare global {
  namespace Express {
    interface Request {
      // Use the AuthUser type for consistency
      user?: AuthUser;
    }
  }
}


export function authenticateJwt(req: express.Request, res: express.Response, next: express.NextFunction) {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
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


export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }
    next();
  };
}
