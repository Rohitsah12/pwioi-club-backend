import express from "express";
import { verifyJwt } from "../auth/jwt.js";
import type { UserRole } from "../auth/types.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        name: string;
        role: UserRole;
        designation?: string;
        phone:string
      };
    }
  }
}

export function authenticateJwt(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Missing authentication token" });

  try {
    const payload = verifyJwt(token);
    req.user = {
      sub: payload.sub ?? "unknown",
      email: payload.email,
      name: payload.name,
      role: payload.role as UserRole,
      phone:payload.phone,
      ...(payload.designation !== undefined && { designation: payload.designation })
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient permissions" });
    }
    next();
  };
}
