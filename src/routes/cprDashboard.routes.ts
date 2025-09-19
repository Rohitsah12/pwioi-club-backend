import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { exportDivisionCprToExcel, getCprDashboard, getDivisionCprDetails, getDivisionProgressDetails, getLaggingSubjectsAnalysis, getSchoolCprDetailsByCenter } from "../controllers/cprDashboard.controllers.js";


const cprDashboardRoutes = Router();




cprDashboardRoutes.get('/',getCprDashboard); 
cprDashboardRoutes.get('/school-details',getSchoolCprDetailsByCenter);
cprDashboardRoutes.get('/lagging-subjects',getLaggingSubjectsAnalysis);

cprDashboardRoutes.get('/division-cpr', getDivisionCprDetails);
cprDashboardRoutes.get('/division-progress/export', exportDivisionCprToExcel);
cprDashboardRoutes.get('/division-progress',getDivisionProgressDetails);

export default cprDashboardRoutes;