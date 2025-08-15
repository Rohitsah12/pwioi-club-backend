import { Router } from "express";
import { authenticateJwt } from "../middlewares/authMiddleware.js";
import { generateSignedUrl, removeMediaFromS3 } from "../controllers/media.controller.js";

const mediaRouter = Router();
mediaRouter.post("/signed-url", authenticateJwt, generateSignedUrl);
mediaRouter.delete("/remove", authenticateJwt, removeMediaFromS3);
export default mediaRouter;


