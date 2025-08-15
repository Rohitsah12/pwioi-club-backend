import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import type { Request, Response } from "express";

export const likePost = catchAsync(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  if (!postId) throw new AppError("Post ID is required", 400);

  const updated = await prisma.post.update({
    where: { id: postId },
    data: {
         likes: { increment: 1 } },
  });

  res.json({ success: true, data: { likes: updated.likes } });
});

export const unlikePost = catchAsync(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  if (!postId) throw new AppError("Post ID is required", 400);

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.likes <= 0) throw new AppError("Invalid unlike", 400);

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { likes: { decrement: 1 } },
  });

  res.json({ success: true, data: { likes: updated.likes } });
});

