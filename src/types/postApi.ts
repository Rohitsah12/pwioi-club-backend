import type { AuthUser } from "../auth/types.js";

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
}



export enum AuthorRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  OPS = 'OPS',
  BATCHOPS = 'BATCHOPS',
  TEACHER = 'TEACHER',
  ASSISTANT_TEACHER = 'ASSISTANT_TEACHER',
  STUDENT = 'STUDENT'
}

export interface CreatePostRequest {
  content?: string;
  media?: MediaInput[];
}

export interface MediaInput {
  type: string;
  mime_type: string;
  storage_url: string;
  thumbnail_url?: string;
  duration?: string;
}

export interface UpdatePostRequest {
  content: string;
}



export interface PostsQuery extends PaginationQuery {
  author_type?: AuthorRole;
  author_id?: string;
  search?: string;
}

export interface CreateCommentRequest {
  postId: string;
  content: string;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface CreateFlagRequest {
  postId: string;
  reason: string;
}

export interface ReviewFlagRequest {
  action: 'approve' | 'dismiss';
}

export interface FlagsQuery extends PaginationQuery {
  is_verified?: string;
  user_role?: string;
}

export interface LikePostRequest {
  postId: string;
}

export interface DashboardStats {
  posts: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  comments: {
    total: number;
  };
  likes: {
    total: number;
  };
  flags: {
    pending: number;
    today: number;
  };
}