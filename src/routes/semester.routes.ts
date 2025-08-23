import { Router, type RequestHandler } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSemester, deleteSemester, getAllSemester, getSemesterDetails, updateSemester } from "../controllers/semester.controller.js";

const semesterRoutes=Router();


semesterRoutes.post("/",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),createSemester);
semesterRoutes.get("/all/:divisionId",authenticateJwt,getAllSemester);
semesterRoutes.patch("/:semesterId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),updateSemester)
semesterRoutes.delete("/:semesterId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),deleteSemester)
semesterRoutes.get("/:semesterId",authenticateJwt,getSemesterDetails)


export default semesterRoutes;