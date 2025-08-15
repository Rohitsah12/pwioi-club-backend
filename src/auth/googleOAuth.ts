import axios from "axios";
import { prisma } from "../db/prisma.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import type { AuthUser, UserRole } from "./types.js";
import { RoleType, TeacherRole } from "./types.js";
import { AppError } from "../utils/AppError.js"; 
import { Prisma } from "@prisma/client";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
  scope: string;
  token_type: string;
}

interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

const googleTokenUrl = "https://oauth2.googleapis.com/token";

const getRedirectUri = (role: UserRole): string => {
  const baseUrl = process.env.BASE_URL || "http://localhost:8000";

  switch (role) {
    case RoleType.SUPER_ADMIN:
    case RoleType.ADMIN:
    case RoleType.OPS:
    case RoleType.BATCHOPS:
      return `${baseUrl}/auth/admin/callback`;
    case TeacherRole.TEACHER:
    case TeacherRole.ASSISTANT_TEACHER:
      return `${baseUrl}/auth/teacher/callback`;
    case "STUDENT":
      return `${baseUrl}/auth/student/callback`;
    default:
      throw new AppError(`Invalid role: ${role}`, 400);
  }
};

const validateRole = (role: string): role is UserRole => {
  const validRoles: string[] = [
    ...Object.values(RoleType),
    ...Object.values(TeacherRole),
    "STUDENT",
  ];
  return validRoles.includes(role);
};

export async function exchangeCodeForTokens(
  code: string,
  role: UserRole
): Promise<GoogleTokenResponse> {
  if (!validateRole(role)) {
    throw new AppError(`Invalid role: ${role}`, 400);
  }

  const redirectUri = getRedirectUri(role);

  const params = new URLSearchParams();
  params.append("code", code);
  params.append("client_id", process.env.GOOGLE_CLIENT_ID!);
  params.append("client_secret", process.env.GOOGLE_CLIENT_SECRET!);
  params.append("redirect_uri", redirectUri);
  params.append("grant_type", "authorization_code");

  try {
    const { data } = await axios.post<GoogleTokenResponse>(googleTokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return data;
  } catch (error: any) {
    console.error("Token exchange error:", error);
    throw new AppError(
      "Failed to exchange authorization code for tokens",
      500
    );
  }
}

export async function verifyIdToken(
  idToken: string
): Promise<GoogleIdTokenPayload> {
  try {
    const { data } = await axios.get<GoogleIdTokenPayload>(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    if (!data.email_verified) {
      throw new AppError("Email is not verified by Google", 403);
    }

    return data;
  } catch (error: any) {
    console.error("ID token verification error:", error);
    throw new AppError("Failed to verify ID token", 401);
  }
}

export async function authenticateUserWithGoogle(
  code: string,
  role: string
): Promise<AuthUser> {

    role=role.trim().toUpperCase();
  if (!validateRole(role)) {
    throw new AppError("Invalid role specified", 400);
  }

  const tokens = await exchangeCodeForTokens(code, role as UserRole);
  const profile = await verifyIdToken(tokens.id_token);

  const tokenUpdateData = {
    googleId: profile.sub,
    googleRefreshToken: tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : null,
    googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    lastLoginAt: new Date(),
  };

  try {
    if (role === RoleType.ADMIN) {
      const userRecord = await prisma.admin.findUnique({
        where: { email: profile.email },
        include: { role: true },
      });

      if (!userRecord) {
        throw new AppError("Admin not found or not authorized for this role", 404);
      }
      
      await prisma.admin.update({
        where: { id: userRecord.id },
        data: tokenUpdateData,
      });

      return {
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        role: userRecord.role.role as UserRole,
        designation: userRecord.designation ?? "",
      };
    } else if (
      role === TeacherRole.TEACHER ||
      role === TeacherRole.ASSISTANT_TEACHER
    ) {
      const userRecord = await prisma.teacher.findUnique({
        where: { email: profile.email },
      });

      if (!userRecord) {
        throw new AppError("Teacher not found", 404);
      }

      await prisma.teacher.update({
        where: { id: userRecord.id },
        data: tokenUpdateData,
      });

      return {
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        role: userRecord.role as TeacherRole,
        designation: userRecord.designation || "",
      };
    } else if (role === "STUDENT") {
      const userRecord = await prisma.student.findUnique({
        where: { email: profile.email },
      });

      if (!userRecord) {
        throw new AppError("Student not found", 404);
      }

      await prisma.student.update({
        where: { id: userRecord.id },
        data: tokenUpdateData,
      });

      return {
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        role: "STUDENT",
      };
    } else {
      throw new AppError("Invalid role specified", 400);
    }
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    console.error("Database error during authentication:", error);
    
    // Handle Prisma errors specifically if needed
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new AppError("Database operation failed", 500);
    }
    
    throw new AppError("Authentication failed", 500);
  }
}

export async function refreshGoogleToken(
  userId: string,
  userType: "admin" | "teacher" | "student"
): Promise<string> {
  let refreshToken: string | null = null;

  try {
    switch (userType) {
      case "admin": {
        const admin = await prisma.admin.findUnique({ where: { id: userId } });
        refreshToken = admin?.googleRefreshToken ?? null;
        break;
      }
      case "teacher": {
        const teacher = await prisma.teacher.findUnique({ where: { id: userId } });
        refreshToken = teacher?.googleRefreshToken ?? null;
        break;
      }
      case "student": {
        const student = await prisma.student.findUnique({ where: { id: userId } });
        refreshToken = student?.googleRefreshToken ?? null;
        break;
      }
      default:
        throw new AppError("Invalid user type specified", 400);
    }

    if (!refreshToken) {
      throw new AppError("No refresh token available", 400);
    }

    const decryptedRefreshToken = decrypt(refreshToken);

    const params = new URLSearchParams();
    params.append("client_id", process.env.GOOGLE_CLIENT_ID!);
    params.append("client_secret", process.env.GOOGLE_CLIENT_SECRET!);
    params.append("refresh_token", decryptedRefreshToken);
    params.append("grant_type", "refresh_token");

    const { data } = await axios.post<{ access_token: string; expires_in: number }>(
      googleTokenUrl,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    return data.access_token;
  } catch (error: any) {
    console.error("Token refresh error:", error);
    
    if (error instanceof AppError) throw error;
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new AppError("Database error during token refresh", 500);
    }
    
    throw new AppError("Failed to refresh access token", 500);
  }
}