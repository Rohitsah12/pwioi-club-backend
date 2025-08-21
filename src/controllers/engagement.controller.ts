import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import type { Request, Response } from "express";
import { getSignedGetUrl } from "../utils/s3.js";

export const createPost = catchAsync(async (req: Request, res: Response) => {

  console.log("=== POST CREATE DEBUG ===");
  console.log("Full request body:", JSON.stringify(req.body, null, 2));
  console.log("Content:", req.body.content);
  console.log("Media array:", req.body.media);
  console.log("User:", req.user);
  console.log("========================");
  const { content, media } = req.body;

  const { id: authorId, role: authorRole } = req.user!;

  // Validate required fields
  if (!content?.trim() && (!media || media.length === 0)) {
    throw new AppError("Post must have content or media", 400);
  }
  // Validate media structure
  if (media && media.length > 0) {
    for (const item of media) {
      if (!item.type || !item.mime_type || !item.s3_key) {  // Changed from 'key' to 's3_key'
        throw new AppError("Invalid media data structure", 400);
      }
    }
  }

  let authorExists = null;
  if (["SUPER_ADMIN", "ADMIN", "OPS", "BATCHOPS"].includes(authorRole)) {
    authorExists = await prisma.admin.findUnique({ where: { id: authorId } });
  } else if (["TEACHER", "ASSISTANT_TEACHER"].includes(authorRole)) {
    authorExists = await prisma.teacher.findUnique({ where: { id: authorId } });
  } else if (authorRole === "STUDENT") {
    authorExists = await prisma.student.findUnique({ where: { id: authorId } });
  }
  if (!authorExists) throw new AppError("Author not found", 404);

 const newPost = await prisma.post.create({
  data: {
    content: content?.trim(),
    author_id: authorId,
    author_type: authorRole,
    media: {
      create: media?.map((m: any) => ({
        type: m.type,
        mime_type: m.mime_type,
        s3_key: m.s3_key, 
        thumbnail_url: m.thumbnail_url || null,  
        duration: m.duration || null
      }))
    },
    likes: 0
  },
  include: { media: true }
});

  res.status(201).json({ success: true, data: newPost });
});

export const getPosts = catchAsync(async (req: Request, res: Response) => {
  const { cursor, limit: limitQuery, search } = req.query;
  const limit = Number(limitQuery) || 10;

  const where: any = {};
  if (search) where.content = { contains: search as string, mode: "insensitive" };

  const posts = await prisma.post.findMany({
    where,
    include: {
      media: true,
      comments: {
        take: 2,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          user_id: true,
          user_role: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor as string }, skip: 1 } : {}),
  });

  let nextCursor: string | null = null;
  if (posts.length > limit) {
    const nextPost = posts.pop();
    nextCursor = nextPost!.id;
  }

  const postsWithUserInfo = await Promise.all(
    posts.map(async (post) => {
      const mediaWithSignedUrls = await Promise.all(
        post.media.map(async (m) => ({
          ...m,
          signedUrl: await getSignedGetUrl(m.s3_key),
        }))
      );
      let userInfo: {
        name?: string;
        designation?: string | null;
        schoolName?: string;
      } = {};

      // Get author information
      switch (post.author_type) {
        case "ADMIN":
        case "SUPER_ADMIN":
        case "OPS":
        case "BATCHOPS": {
          const admin = await prisma.admin.findUnique({
            where: { id: post.author_id },
            select: { name: true, designation: true },
          });
          if (admin) {
            userInfo.name = admin.name;
            userInfo.designation = admin.designation;
          }
          break;
        }
        case "TEACHER":
        case "ASSISTANT_TEACHER": {
          const teacher = await prisma.teacher.findUnique({
            where: { id: post.author_id },
            select: { name: true, designation: true },
          });
          if (teacher) {
            userInfo.name = teacher.name;
            userInfo.designation = teacher.designation;
          }
          break;
        }
        case "STUDENT": {
          const student = await prisma.student.findUnique({
            where: { id: post.author_id },
            select: {
              name: true,
              school: {
                select: { name: true },
              },
            },
          });
          if (student) {
            userInfo.name = student.name;
            if (student.school) userInfo.schoolName = student.school.name;
          }
          break;
        }
        default:
          break;
      }

      const commentsWithUserInfo = await Promise.all(
        post.comments.map(async (comment) => {
          let commentUserInfo: { name?: string } = {};

          switch (comment.user_role) {
            case "ADMIN":
            case "SUPER_ADMIN":
            case "OPS":
            case "BATCHOPS": {
              const admin = await prisma.admin.findUnique({
                where: { id: comment.user_id },
                select: { name: true },
              });
              if (admin) commentUserInfo.name = admin.name;
              break;
            }
            case "TEACHER":
            case "ASSISTANT_TEACHER": {
              const teacher = await prisma.teacher.findUnique({
                where: { id: comment.user_id },
                select: { name: true },
              });
              if (teacher) commentUserInfo.name = teacher.name;
              break;
            }
            case "STUDENT": {
              const student = await prisma.student.findUnique({
                where: { id: comment.user_id },
                select: { name: true },
              });
              if (student) commentUserInfo.name = student.name;
              break;
            }
            default:
              break;
          }

          return {
            ...comment,
            userInfo: commentUserInfo,
          };
        })
      );

      return {
        ...post,
        media: mediaWithSignedUrls,
        userInfo,
        comments: commentsWithUserInfo,
        totalCommentsCount: post._count.comments,
      };
    })
  );

  res.json({
    success: true,
    data: postsWithUserInfo,
    nextCursor,
  });
});

export const getPostById = catchAsync(async (req: Request, res: Response) => {
  const { postId } = req.params;
  if (!postId) throw new AppError("Post ID is required", 400);

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      media: true,
    },
  });

  if (!post) throw new AppError("Post not found", 404);
  const mediaWithSignedUrls = await Promise.all(
    post.media.map(async (m) => ({
      ...m,
      signedUrl: await getSignedGetUrl(m.s3_key),
    }))
  );

  let userInfo: { designation?: string | null; schoolName?: string } = {};

  switch (post.author_type) {
    case "ADMIN":
    case "SUPER_ADMIN":
    case "OPS":
    case "BATCHOPS": {
      const admin = await prisma.admin.findUnique({
        where: { id: post.author_id },
        select: { designation: true },
      });
      if (admin) userInfo.designation = admin.designation;
      break;
    }
    case "TEACHER":
    case "ASSISTANT_TEACHER": {
      const teacher = await prisma.teacher.findUnique({
        where: { id: post.author_id },
        select: { designation: true },
      });
      if (teacher) userInfo.designation = teacher.designation;
      break;
    }
    case "STUDENT": {
      const student = await prisma.student.findUnique({
        where: { id: post.author_id },
        include: {
          school: { select: { name: true } },
        },
      });
      if (student?.school) userInfo.schoolName = student.school.name;
      break;
    }
    default:
      break;
  }

  res.json({
    success: true,
    data: {
      ...post,
      media: mediaWithSignedUrls,
      userInfo,
    },
  });
});

export const updatePost = catchAsync(async (req: Request, res: Response) => {
  const { postId } = req.params;
  const { content } = req.body;
  const { id, role } = req.user!;
  if (!content?.trim()) throw new AppError("Content required", 400);
  if (!postId) throw new AppError("Post ID is required", 400);
  const existing = await prisma.post.findUnique({ where: { id: postId } });
  if (!existing) throw new AppError("Post not found", 404);
  const canEdit = existing.author_id === id || ["SUPER_ADMIN", "ADMIN"].includes(role as string);
  if (!canEdit) throw new AppError("Not allowed", 403);
  const updated = await prisma.post.update({ where: { id: postId }, data: { content: content.trim(), updatedAt: new Date() } });
  res.json({ success: true, data: updated });
});

export const deletePost = catchAsync(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  if (!postId) throw new AppError("Post ID is required", 400);

  const { id, role } = req.user!;

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError("Post not found", 404);

  const canDelete =
    post.author_id === id || ["SUPER_ADMIN", "ADMIN"].includes(role as string);

  if (!canDelete) throw new AppError("Not allowed", 403);

  await prisma.post.delete({ where: { id: postId } });
  res.json({ success: true, message: "Post deleted" });
});

export const getPostStats = catchAsync(async (req: Request, res: Response) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalPosts, totalComments, likesSum, pendingFlags, postsToday, postsWeek, postsMonth, flagsToday] = await Promise.all([
    prisma.post.count(),
    prisma.comment.count(),
    prisma.post.aggregate({ _sum: { likes: true } }),
    prisma.flag.count({ where: { is_verified: false } }),
    prisma.post.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.post.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.post.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.flag.count({ where: { is_verified: false, createdAt: { gte: startOfDay } } })
  ]);
  res.json({
    success: true,
    data: {
      posts: { total: totalPosts, today: postsToday, thisWeek: postsWeek, thisMonth: postsMonth },
      comments: { total: totalComments },
      likes: { total: likesSum._sum.likes ?? 0 },
      flags: { pending: pendingFlags, today: flagsToday }
    }
  });
});