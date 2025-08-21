import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createEvents, deleteEvents, getALlEvents, getEvents, updateEvents } from "../controllers/event.controller.js";

const eventRoutes=Router();


eventRoutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),createEvents)
eventRoutes.get("/All",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getALlEvents)
eventRoutes.get("/:eventId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),getEvents)
eventRoutes.put("/:eventId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),updateEvents)
eventRoutes.delete("/:eventId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","BATCHOPS","OPS"),deleteEvents)


export default eventRoutes;