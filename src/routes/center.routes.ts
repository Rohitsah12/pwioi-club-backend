import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { assignCenterHeads, createCenter, getAllCenters, getAllCentersByAdmin, updateCenter } from "../controllers/center.controller.js";

const centerRouter=Router();

centerRouter.post('/create',authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),createCenter)
centerRouter.patch('/:centerId',authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),updateCenter)

centerRouter.put("/:code/assign-heads", authenticateJwt, requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"), assignCenterHeads);

centerRouter.get("/all",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getAllCenters)

centerRouter.get("/:adminId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN","BATCHOPS","OPS"),getAllCentersByAdmin)


export default centerRouter;