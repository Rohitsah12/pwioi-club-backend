import { Router } from "express";
import { getAttendanceByCenter } from "../controllers/dailyAttendance.controller.js";


const dailyAttendanceRoutes = Router();

dailyAttendanceRoutes.get("/", getAttendanceByCenter);
export default dailyAttendanceRoutes;