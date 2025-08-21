import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createRoom, deleteRoom, getRoomById, getRooms, updateRoom } from "../controllers/room.controller.js";

const roomRoutes=Router();

roomRoutes.post("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),createRoom)
roomRoutes.get("",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),getRooms)
roomRoutes.get("/:roomId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),getRoomById)
roomRoutes.put("/:roomId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),updateRoom)
roomRoutes.delete("/:roomId",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","OPS","BATCHOPS"),deleteRoom)


export default roomRoutes;