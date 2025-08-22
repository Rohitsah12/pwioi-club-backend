import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createJob, deleteJob, getAllJob, getJob, updateJob } from "../controllers/job.controller.js";

const jobRoutes=Router();


jobRoutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),createJob)
jobRoutes.put("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),updateJob)
jobRoutes.delete("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),deleteJob)
jobRoutes.get("/All",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getAllJob)
jobRoutes.get("/:jobId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getJob)

export default jobRoutes;