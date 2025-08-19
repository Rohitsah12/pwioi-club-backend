import { Router, type RequestHandler } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSemester, deleteSemester, getAllSemester, getSemesterDetails, updateSemester } from "../controllers/semester.controller.js";

const semesterRoutes=Router();


semesterRoutes.post("/",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createSemester);
semesterRoutes.get("/all/:divisionId",authenticateJwt,getAllSemester);
semesterRoutes.patch("/:semesterId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),updateSemester)
semesterRoutes.delete("/:semesterId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteSemester)
semesterRoutes.get("/:semesterId",authenticateJwt,getSemesterDetails)


export default semesterRoutes;