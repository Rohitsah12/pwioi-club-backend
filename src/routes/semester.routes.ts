import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSemester } from "../controllers/semester.controller.js";

const semesterRoutes=Router();


semesterRoutes.post("/",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createSemester)

export default semesterRoutes;