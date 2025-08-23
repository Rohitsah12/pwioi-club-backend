import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { AddOps, deleteOps, getAllOps, getOps, updateOps } from "../controllers/ops.controller.js";

const opsRoutes=Router();


opsRoutes.post("",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),AddOps)
opsRoutes.get("/All",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getAllOps)
opsRoutes.get("/:opsId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getOps)
opsRoutes.put("/:opsId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),updateOps)
opsRoutes.delete("/:opsId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),deleteOps)



export default opsRoutes;