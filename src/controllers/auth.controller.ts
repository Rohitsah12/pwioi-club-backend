import type { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { authenticateUserWithGoogle } from "../auth/googleOAuth.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/jwt.js"; 
import { findUserById } from '../service/userService.js';

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    httpOnly: true,
    secure: isProduction, 
    sameSite: isProduction ? 'none' as const : 'strict' as const,
    maxAge: 60 * 60 * 1000,
    domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
  };
};

const googleLogin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { code, role } = req.body;

  if (!code || !role) {
    throw new AppError('Missing required fields: code and role', 400);
  }

  if (typeof role !== 'string' || role.trim() === '') {
    throw new AppError('Invalid role format', 400);
  }

  const trimmedRole = role.trim().toUpperCase();
  let user;

  try {
    user = await authenticateUserWithGoogle(code, trimmedRole);
  } catch (error: any) {
    console.error('Google login error:', error);

    let statusCode = 401;
    if (error.message.includes('not found')) statusCode = 404;
    else if (error.message.includes('Invalid role')) statusCode = 400;

    throw new AppError(error.message, statusCode);
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  res.cookie('token', accessToken, getCookieOptions());

  res.status(200).json({
    success: true,
    tokens: {
      accessToken,
      refreshToken,
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation,
    },
  });
});

const logout = catchAsync(async (req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const clearOptions: any = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' as const : 'strict' as const,
  };

  if (process.env.COOKIE_DOMAIN) {
    clearOptions.domain = process.env.COOKIE_DOMAIN;
  }
  
  res.clearCookie("token", clearOptions);

  return res.status(200).json({ 
    success: true,
    message: "Logged out successfully" 
  });
});

const getMe = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401);
  }

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { token } = req.body;

  if (!token) {
    throw new AppError('Refresh token is required', 400);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (error) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await findUserById(decoded.id);
  if (!user) {
    throw new AppError('User belonging to this token no longer exists', 404);
  }

  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  res.cookie('token', newAccessToken, getCookieOptions());

  res.status(200).json({
    success: true,
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    },
  });
});

export { googleLogin, logout, getMe, refreshToken };