import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";
import { Prisma } from "@prisma/client";

export function globalErrorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    let message = "Database error";
    let statusCode = 400;

    switch (err.code) {
      case "P2002":
        const field = Array.isArray(err.meta?.target) 
          ? err.meta.target.join(', ') 
          : err.meta?.target || 'field';
        message = `${field} already exists`;
        statusCode = 409;
        break;
        
      case "P2025":
        message = "Record not found";
        statusCode = 404;
        break;
        
      case "P2003":
        message = "Invalid reference - related record not found";
        statusCode = 400;
        break;
        
      case "P2014":
        message = "Invalid ID provided";
        statusCode = 400;
        break;
        
      default:
        message = "Database operation failed";
    }

    return res.status(statusCode).json({
      status: "error",
      message
    });
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      status: "error",
      message: "Invalid data provided"
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message
    });
  }

  console.error("💥 Unexpected Error:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  res.status(500).json({
    status: "error",
    message: process.env.NODE_ENV === "production" 
      ? "Something went wrong!" 
      : err.message
  });
}