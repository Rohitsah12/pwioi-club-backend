import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createPost, deletePost, getPostById, getPosts, getPostStats, updatePost } from "../controllers/engagement.controller.js";

const engagementRouter = Router();
engagementRouter.post("/create", authenticateJwt, createPost);
engagementRouter.get('/get', authenticateJwt, getPosts);
engagementRouter.get('/get/:postId', authenticateJwt, getPostById);
engagementRouter.put('/update/:postId', authenticateJwt, updatePost);
engagementRouter.delete('/delete/:postId', authenticateJwt, deletePost);
engagementRouter.get('/post-stats',authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getPostStats)

export default engagementRouter;