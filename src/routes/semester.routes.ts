import { Router, type RequestHandler } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSemester, deleteSemester, getAllSemester, getSemesterDetails, updateSemester } from "../controllers/semester.controller.js";

const semesterRoutes=Router();


semesterRoutes.post("/",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createSemester);
semesterRoutes.get("/all/:divisionId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","TEACHER"),getAllSemester);
semesterRoutes.patch("/:semesterId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),updateSemester)
semesterRoutes.delete("/:semesterId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteSemester)
semesterRoutes.get("/:semesterId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getSemesterDetails)


export default semesterRoutes;