import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { AddMentor, deleteMentor, getAllMentor, getMentor, updateMentor } from "../controllers/mentor.controller.js";

const mentorRoutes=Router();

mentorRoutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),AddMentor)
mentorRoutes.get("/All",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getAllMentor)
mentorRoutes.get("/:mentorId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getMentor)
mentorRoutes.put("/:mentorId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),updateMentor)
mentorRoutes.delete("/:mentorId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),deleteMentor)

export default mentorRoutes