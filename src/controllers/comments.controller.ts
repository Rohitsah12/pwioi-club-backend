import type {Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { validateRequiredFields } from "../utils/postvalidation.js";
import { findUserByRole } from "../service/userService.js";


export const createComment = catchAsync(async (req:Request,res:Response) => {
  const { postId, content } = req.body;
  const { sub, role } = req.user!;
  validateRequiredFields(["postId", "content"], req.body);
  if (!content.trim()) throw new AppError("Content cannot be empty", 400);
  const exists = await prisma.post.findUnique({ where: { id: postId } });
  if (!exists) throw new AppError("Post not found", 404);
  await findUserByRole(sub, role);
  const comment = await prisma.comment.create({ data: { post_id: postId, user_id: sub, user_role: role, content: content.trim() } });
  res.status(201).json({ success: true, data: comment });
});

export const getCommentsByPost = catchAsync(async (req: Request, res: Response) => {
  const { postId } = req.params;
  
  if (!postId) {
    return res.status(400).json({
      success: false,
      message: "Post ID is required"
    });
  }
  
  const comments = await prisma.comment.findMany({
    where: { post_id: postId },
    orderBy: { createdAt: "desc" },
  });

  const commentsWithUserInfo = await Promise.all(
    comments.map(async (comment) => {
      let userInfo: { username?: string; designation?: string | null } = {};

      switch (comment.user_role) {
        case "ADMIN":
        case "SUPER_ADMIN":
        case "OPS":
        case "BATCHOPS": {
          const admin = await prisma.admin.findUnique({
            where: { id: comment.user_id },
            select: { name: true, designation: true },
          });
          if (admin) userInfo = { username: admin.name, designation: admin.designation };
          break;
        }
        case "TEACHER":
        case "ASSISTANT_TEACHER": {
          const teacher = await prisma.teacher.findUnique({
            where: { id: comment.user_id },
            select: { name: true, designation: true },
          });
          if (teacher) userInfo = { username: teacher.name, designation: teacher.designation };
          break;
        }
        case "STUDENT": {
          const student = await prisma.student.findUnique({
            where: { id: comment.user_id },
            include: { 
              school: { 
                select: { name: true } 
              } 
            },
          });
          if (student)
            userInfo = { username: student.name, designation: student.school?.name };

          
          break;
        }
        default:
          break;
      }

      return {
        ...comment,
        userInfo,
      };
    })
  );

  res.json({
    success: true,
    data: commentsWithUserInfo,
  });
});

export const updateComment = catchAsync(async (req:Request,res:Response) => {
  const { commentId } = req.params;

  if(!commentId){
    return res.status(400).json({
      success: false,
      message: "Comment Id is required"
    });
    
  }
  const { content } = req.body;
  if(!content){
    return res.status(400).json({
      success: false,
      message: "Content is required"
    });
  }
  const { sub, role } = req.user!;
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new AppError("Comment not found", 404);
  const canEdit = comment.user_id === sub || ["SUPER_ADMIN","ADMIN"].includes(role);
  if (!canEdit) throw new AppError("Not allowed", 403);
  const updated = await prisma.comment.update({ where: { id: commentId }, data: { content: content, updatedAt: new Date() } });
  res.json({ success: true, data: updated });
});

export const deleteComment = catchAsync(async (req:Request,res:Response) => {
  const { commentId } = req.params;
  if(!commentId){
    return res.status(400).json({
      success: false,
      message: "Comment Id is required"
    });
    
  }
  const { sub, role } = req.user!;
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new AppError("Comment not found", 404);
  const canDelete = comment.user_id === sub || ["SUPER_ADMIN", "ADMIN"].includes(role);
  if (!canDelete) throw new AppError("Not allowed", 403);
  await prisma.comment.delete({ where: { id: commentId } });
  res.json({ success: true, message: "Comment deleted" });
});