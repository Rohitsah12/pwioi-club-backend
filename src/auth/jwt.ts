import jwt from "jsonwebtoken";
import type { AuthUser } from "./types.js";

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

export function signJwt(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      designation: user.designation,
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

export function verifyJwt(token: string): AuthUser & jwt.JwtPayload {
  return jwt.verify(token, JWT_SECRET) as AuthUser & jwt.JwtPayload;
}
