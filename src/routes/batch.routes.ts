import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createBatch, deleteBatch, getAllBatchesSchoolwise, getBatchDetails, updateBatch } from "../controllers/batch.controller.js";

const batchRoutes=Router();


batchRoutes.post("/create",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createBatch)
batchRoutes.get("/:schoolId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","TEACHER"),getAllBatchesSchoolwise)

batchRoutes.delete("/:batchId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteBatch)

batchRoutes.get("/get/:batchId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getBatchDetails)

batchRoutes.patch("/:batchId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),updateBatch)

export default batchRoutes