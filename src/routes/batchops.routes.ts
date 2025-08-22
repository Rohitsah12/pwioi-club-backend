import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { AddBatchOps, deleteBatchOps, getALLBatchOps, getBatchOps, UpdateBatchOps } from "../controllers/batchOps.controller.js";

const batchOpsROutes=Router()


batchOpsROutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),AddBatchOps)
batchOpsROutes.get("/All",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getALLBatchOps)
batchOpsROutes.get("/:batchOpsId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getBatchOps)
batchOpsROutes.put("/:batchOpsId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),UpdateBatchOps)
batchOpsROutes.delete("/:batchOpsId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteBatchOps)



export default  batchOpsROutes;