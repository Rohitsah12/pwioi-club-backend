import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { exportDivisionCprToExcel, getCprDashboard, getDivisionCprDetails, getDivisionProgressDetails, getLaggingSubjectsAnalysis, getSchoolCprDetailsByCenter } from "../controllers/cprDashboard.controllers.js";


const cprDashboardRoutes = Router();




cprDashboardRoutes.get('/',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN", "OPS", "BATCHOPS"),getCprDashboard); 
cprDashboardRoutes.get('/school-details',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN", "OPS", "BATCHOPS"),getSchoolCprDetailsByCenter);
cprDashboardRoutes.get('/lagging-subjects',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN", "OPS", "BATCHOPS"),getLaggingSubjectsAnalysis);

cprDashboardRoutes.get('/division-cpr',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN", "OPS", "BATCHOPS"),getDivisionCprDetails);
cprDashboardRoutes.get('/division-progress/export',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN", "OPS", "BATCHOPS"),exportDivisionCprToExcel);
cprDashboardRoutes.get('/division-progress',authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN", "OPS", "BATCHOPS"),getDivisionProgressDetails);

export default cprDashboardRoutes;