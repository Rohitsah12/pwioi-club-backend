import { Router } from "express";
import { authenticateJwt } from "../middlewares/authMiddleware.js";
import { likePost, unlikePost } from "../controllers/like.controller.js";

const likesRouter=Router();
likesRouter.put('/like/:postId', authenticateJwt, likePost);
likesRouter.post('/unlike/:postId', authenticateJwt, unlikePost);

export default likesRouter;