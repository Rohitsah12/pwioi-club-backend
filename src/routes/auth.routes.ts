import { Router } from "express";
import {googleLogin,  getMe, logout } from "../controllers/auth.controller.js";
import { authenticateJwt } from "../middlewares/authMiddleware.js";

const authRouter=Router();

authRouter.post('/google',googleLogin)
authRouter.post('/logout',authenticateJwt,logout)

authRouter.get('/me',authenticateJwt,getMe)


export default authRouter