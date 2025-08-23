import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { AddBatchOps, deleteBatchOps, getALLBatchOps, getBatchOps, UpdateBatchOps } from "../controllers/batchOps.controller.js";

const batchOpsROutes=Router()


batchOpsROutes.post("",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),AddBatchOps)
batchOpsROutes.get("/All",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getALLBatchOps)
batchOpsROutes.get("/:batchOpsId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getBatchOps)
batchOpsROutes.put("/:batchOpsId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),UpdateBatchOps)
batchOpsROutes.delete("/:batchOpsId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),deleteBatchOps)



export default  batchOpsROutes;