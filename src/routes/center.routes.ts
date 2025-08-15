import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { assignCenterHeads, createCenter, getAllCenters, getAllCentersByAdmin } from "../controllers/center.controller.js";

const centerRouter=Router();

centerRouter.post('/create',authenticateJwt,requireRoles('SUPER_ADMIN'),createCenter)

centerRouter.put("/:code/assign-heads", authenticateJwt, requireRoles("SUPER_ADMIN"), assignCenterHeads);

centerRouter.get("/all",authenticateJwt,requireRoles('SUPER_ADMIN'),getAllCenters)

centerRouter.get("/:adminId",authenticateJwt,requireRoles('SUPER_ADMIN',"ADMIN"),getAllCentersByAdmin)


export default centerRouter;