import { Router } from "express";
import { authenticateJwt } from "../middlewares/authMiddleware.js";
import { createComment, deleteComment, getCommentsByPost, updateComment } from "../controllers/comments.controller.js";

const commentRoutes=Router();

commentRoutes.post('/post-comment', authenticateJwt, createComment);
commentRoutes.get('/get/:postId', authenticateJwt, getCommentsByPost);
commentRoutes.put('/update/:commentId', authenticateJwt, updateComment);
commentRoutes.delete('delete/:commentId', authenticateJwt, deleteComment);


export default commentRoutes;