import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createSchools, deleteSchool, getAllSchools, getSchoolStats, updateSchool } from "../controllers/school.controller.js";

const schoolRoutes=Router();


schoolRoutes.post("/create",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),createSchools)
schoolRoutes.get("/:centerId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","TEACHER","BATCHOPS","OPS"),getAllSchools)
schoolRoutes.delete("/:schoolId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),deleteSchool)

schoolRoutes.get("/school-stats/:schoolId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getSchoolStats)

schoolRoutes.patch("/:schoolId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),updateSchool)


export default schoolRoutes;