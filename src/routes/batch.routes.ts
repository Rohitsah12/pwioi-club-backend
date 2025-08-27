import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createBatch, deleteBatch, getAllBatchesCenterwise, getAllBatchesSchoolwise, getBatchDetails, updateBatch } from "../controllers/batch.controller.js";

const batchRoutes=Router();


batchRoutes.post("/create",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),createBatch)
batchRoutes.get("/center/:centerId",authenticateJwt,getAllBatchesCenterwise)

batchRoutes.delete("/:batchId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),deleteBatch)

batchRoutes.get("/get/:batchId",authenticateJwt,getBatchDetails)

batchRoutes.get("/:schoolId",authenticateJwt,getAllBatchesSchoolwise)
batchRoutes.patch("/:batchId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),updateBatch)

export default batchRoutes