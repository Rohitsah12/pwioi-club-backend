import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import {validateRequiredFields } from "../utils/postvalidation.js";
import { findUserByRole } from "../service/userService.js";
import type { Request, Response } from "express";

export const flagPost = catchAsync(async (req:Request,res:Response) => {
  const { postId, reason } = req.body;
  const { sub, role } = req.user!;
  validateRequiredFields(["postId", "reason"], req.body);
  if (!["STUDENT", "TEACHER", "ASSISTANT_TEACHER","ADMIN","SUPER_ADMIN","OPS","BATCHOPS"].includes(role))
    throw new AppError("Not allowed to flag", 403);
  await findUserByRole(sub, role);
  const existing = await prisma.flag.findFirst({ where: { post_id: postId, flagged_by: sub, is_verified: false } });
  if (existing) throw new AppError("Already flagged", 400);
  const flag = await prisma.flag.create({ data: { post_id: postId, content: reason, flagged_by: sub, user_role: role } });
  res.status(201).json({ success: true, data: flag });
});

export const getFlags = catchAsync(async (req: Request, res: Response) => {


  const { is_verified, user_role } = req.query;

  const where: any = {};

  if (is_verified !== undefined) {
    where.is_verified = is_verified === "true"; 
  }

  if (user_role) {
    where.user_role = user_role as string;
  }

  const flags = await prisma.flag.findMany({
    where,
    include: {
      post: {
        include: { media: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    success: true,
    data: flags,
  });
});

export const reviewFlag = catchAsync(async (req:Request,res:Response) => {
  const { action } = req.body;
  if(!action){
    throw new AppError("Action required",400)
  }
  if(!req.params.flagId){
    throw new AppError("FlagId required",400)
  }
  const flag = await prisma.flag.findUnique({ where: { id: req.params.flagId } });
  if (!flag) throw new AppError("Flag not found", 404);
  if (action === "approve") {
    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { post_id: flag.post_id } }),
      prisma.flag.deleteMany({ where: { post_id: flag.post_id } }),
      prisma.post.delete({ where: { id: flag.post_id } })
    ]);
    res.json({ success: true, message: "Post deleted" });
  } else {
    await prisma.flag.update({ where: { id: req.params.flagId }, data: { is_verified: true } });
    res.json({ success: true, message: "Flag dismissed" });
  }
});

