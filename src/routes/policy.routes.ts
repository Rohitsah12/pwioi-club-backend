import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createPolicy, deletePolicy, getAllPolicy, getByPolicyId, updatePolicy } from "../controllers/policy.controller.js";

const policyRoutes=Router();

policyRoutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),createPolicy)
policyRoutes.get("/:policyId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getByPolicyId)
policyRoutes.put("/:policyId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),updatePolicy)
policyRoutes.delete("/:policyId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),deletePolicy)

policyRoutes.get("/center/:centerId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getAllPolicy)
export default policyRoutes;