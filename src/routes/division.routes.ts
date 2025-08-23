import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createDivision, deleteDivision, getDivisionBatch, getDivisionByCenter, getDivisionBySchool, getDivisionDetails, updateDivision } from "../controllers/division.controller.js";

const divisionRoutes=Router();


divisionRoutes.post("/",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),createDivision)
divisionRoutes.patch("/:divisionId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),updateDivision )
divisionRoutes.delete("/:divisionId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),deleteDivision)
divisionRoutes.get("/by-batch/:batchId",authenticateJwt,getDivisionBatch)
divisionRoutes.get("/by-school/:schoolId",authenticateJwt,getDivisionBySchool)
divisionRoutes.get("/by-center/:centerId",authenticateJwt,getDivisionByCenter)

divisionRoutes.get("/:divisionId",authenticateJwt,getDivisionDetails)

export default divisionRoutes;