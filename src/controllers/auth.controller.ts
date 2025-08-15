import type { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { authenticateUserWithGoogle } from "../auth/googleOAuth.js";
import { signJwt } from "../auth/jwt.js";



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

  const token = signJwt(user);

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000,
  });

  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation,
    },
  });
})

const logout = catchAsync(async (req: Request, res: Response) => {
res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict"
  });

  return res.status(200).json({ message: "Logged out successfully" });
    
  } 
);

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

export {googleLogin,logout,getMe};