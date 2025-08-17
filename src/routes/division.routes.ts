import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createDivision, deleteDivision, getDivisionBatch, getDivisionByCenter, getDivisionBySchool, getDivisionDetails, updateDivision } from "../controllers/division.controller.js";

const divisionRoutes=Router();


divisionRoutes.post("/",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createDivision)
divisionRoutes.patch("/:divisionId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),updateDivision )
divisionRoutes.delete("/:divisionId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteDivision)
divisionRoutes.get("/by-batch/:batchId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","TEACHER"),getDivisionBatch)
divisionRoutes.get("/by-school/:schoolId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getDivisionBySchool)
divisionRoutes.get("/by-center/:centerId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getDivisionByCenter)

divisionRoutes.get("/:divisionId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getDivisionDetails)

export default divisionRoutes;