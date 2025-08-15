import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSchools, deleteSchool, getAllSchools, getSchoolStats, updateSchool } from "../controllers/school.controller.js";

const schoolRoutes=Router();


schoolRoutes.post("/create",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createSchools)
schoolRoutes.get("/:centerId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","TEACHER"),getAllSchools)
schoolRoutes.delete("/:schoolId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteSchool)

schoolRoutes.get("/school-stats/:schoolId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getSchoolStats)

schoolRoutes.patch("/:schoolId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),updateSchool)


export default schoolRoutes;