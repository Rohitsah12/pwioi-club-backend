import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSchools, deleteSchool, getAllSchools, getSchoolStats } from "../controllers/school.controller.js";

const schoolRoutes=Router();


schoolRoutes.post("/create",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createSchools)
schoolRoutes.get("/:centerId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getAllSchools)
schoolRoutes.delete("/:centerId/:schoolId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteSchool)

schoolRoutes.get("/school-stats/:schoolId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getSchoolStats)


export default schoolRoutes;