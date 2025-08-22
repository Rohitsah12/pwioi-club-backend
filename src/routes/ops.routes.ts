import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { AddOps, deleteOps, getAllOps, getOps, updateOps } from "../controllers/ops.controller.js";

const opsRoutes=Router();


opsRoutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),AddOps)
opsRoutes.get("/All",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getAllOps)
opsRoutes.get("/:opsId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),getOps)
opsRoutes.put("/:opsId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),updateOps)
opsRoutes.delete("/:opsId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN"),deleteOps)



export default opsRoutes;