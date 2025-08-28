import { Router } from "express";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";
import { createAchievement, createCertification, createOrUpdateAcademicHistory, createPersonalDetails, createPlacements, createProject, createSocialLinks, createStudentDegreePartner,  deleteAcademicHistoryByEducationId, deleteAchievements, deleteCertification, deletePersonalDetails, deletePlacements, deleteProject, deleteSocialLinks, deleteStudentDegreePartner, getAcademicHistory, getAchievementsById, getAllAchievements, getAllCertifications, getAllPlacements, getAllProjects, getAllSocialLinks, getCertificationById, getPersonalDetails, getPlacementsById, getProjectById, getSocialLinksById, getStudentAcademicDetails, getStudentContactInfo, getStudentDegreePartner, getStudentProfiles, updateAchievements, updateCertification, updatePersonalDetails, updatePlacements, updateProject, updateSocialLinks, updateStudentAddress, updateStudentDegreePartner } from "../controllers/studentprofiles.controller.js";

const studentProfileRoutes=Router();

studentProfileRoutes.get("/:studentId/basic-details",authenticateJwt,requireRoles("STUDENT"),getStudentAcademicDetails)

studentProfileRoutes.post("/:studentId/personal-details",authenticateJwt,requireRoles("STUDENT"),createPersonalDetails)
studentProfileRoutes.get("/:studentId/personal-details",authenticateJwt,getPersonalDetails)
studentProfileRoutes.put("/:studentId/personal-details",authenticateJwt,requireRoles("STUDENT"),updatePersonalDetails)
studentProfileRoutes.delete("/:studentId/personal-details",authenticateJwt,requireRoles("STUDENT"),deletePersonalDetails)


studentProfileRoutes.patch("/:studentId/academic-history",authenticateJwt,requireRoles("STUDENT"),createOrUpdateAcademicHistory)
studentProfileRoutes.get("/:studentId/academic-history",authenticateJwt,getAcademicHistory)
studentProfileRoutes.delete("/:studentId/academic-history/:educationId", authenticateJwt, requireRoles("STUDENT"), deleteAcademicHistoryByEducationId);


studentProfileRoutes.get("/:studentId/projects",authenticateJwt,getAllProjects)
studentProfileRoutes.get("/:studentId/projects/:projectId",authenticateJwt,getProjectById)
studentProfileRoutes.post("/:studentId/projects",authenticateJwt,requireRoles("STUDENT"),createProject)
studentProfileRoutes.patch("/:studentId/projects/:projectId",authenticateJwt,requireRoles("STUDENT"),updateProject)
studentProfileRoutes.delete("/:studentId/projects/:projectId",authenticateJwt,requireRoles("STUDENT"),deleteProject)


studentProfileRoutes.get("/:studentId/certifications",authenticateJwt,getAllCertifications)
studentProfileRoutes.get("/:studentId/certifications/:certificationId",authenticateJwt,getCertificationById)
studentProfileRoutes.post("/:studentId/certifications",authenticateJwt,requireRoles("STUDENT"),createCertification)
studentProfileRoutes.patch("/:studentId/certifications/:certificationId",authenticateJwt,requireRoles("STUDENT"),updateCertification)
studentProfileRoutes.delete("/:studentId/certifications/:certificationId",authenticateJwt,requireRoles("STUDENT"),deleteCertification)

studentProfileRoutes.get("/:studentId/placements",authenticateJwt,getAllPlacements)
studentProfileRoutes.get("/:studentId/placements/:placementId",authenticateJwt,getPlacementsById)
studentProfileRoutes.post("/:studentId/placements",authenticateJwt,requireRoles("STUDENT"),createPlacements)
studentProfileRoutes.patch("/:studentId/placements/:placementId",authenticateJwt,requireRoles("STUDENT"),updatePlacements)
studentProfileRoutes.delete("/:studentId/placements/:placementId",authenticateJwt,requireRoles("STUDENT"),deletePlacements)

studentProfileRoutes.get("/:studentId/achievements",authenticateJwt,getAllAchievements)
studentProfileRoutes.get("/:studentId/achievements/:achievementId",authenticateJwt,getAchievementsById)
studentProfileRoutes.post("/:studentId/achievements",authenticateJwt,requireRoles("STUDENT"),createAchievement)
studentProfileRoutes.patch("/:studentId/achievements/:achievementId",authenticateJwt,requireRoles("STUDENT"),updateAchievements)
studentProfileRoutes.delete("/:studentId/achievements/:achievementId",authenticateJwt,requireRoles("STUDENT"),deleteAchievements)

studentProfileRoutes.get("/:studentId/social-links",authenticateJwt,getAllSocialLinks)
studentProfileRoutes.get("/:studentId/social-links/:socialLinkId",authenticateJwt,getSocialLinksById)
studentProfileRoutes.post("/:studentId/social-links",authenticateJwt,requireRoles("STUDENT"),createSocialLinks)
studentProfileRoutes.patch("/:studentId/social-links/:socialLinkId",authenticateJwt,requireRoles("STUDENT"),updateSocialLinks)
studentProfileRoutes.delete("/:studentId/social-links/:socialLinkId",authenticateJwt,requireRoles("STUDENT"),deleteSocialLinks)

studentProfileRoutes.post("/:studentId/degree-partner", authenticateJwt, requireRoles("STUDENT"), createStudentDegreePartner)
studentProfileRoutes.get("/:studentId/degree-partner", authenticateJwt, getStudentDegreePartner)
studentProfileRoutes.put("/:studentId/degree-partner", authenticateJwt, requireRoles("STUDENT"), updateStudentDegreePartner)
studentProfileRoutes.delete("/:studentId/degree-partner", authenticateJwt, requireRoles("STUDENT"), deleteStudentDegreePartner)


studentProfileRoutes.get("/:studentId/contact",authenticateJwt,requireRoles("ADMIN","SUPER_ADMIN","STUDENT"),getStudentContactInfo);
studentProfileRoutes.put("/:studentId/address",authenticateJwt,requireRoles("STUDENT", "ADMIN", "SUPER_ADMIN"),updateStudentAddress);


studentProfileRoutes.get("/:studentId/profile",getStudentProfiles)




export default studentProfileRoutes;