import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";
import { globalErrorHandler } from "./middlewares/errorHandler.js";
import superadminrouter from "./routes/superadmin.routes.js";
import authRouter from "./routes/auth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import centerRouter from "./routes/center.routes.js";
import engagementRouter from "./routes/engagement.routes.js";
import mediaRouter from "./routes/media.routes.js";
import commentRoutes from "./routes/comments.routes.js";
import likesRouter from "./routes/like.routes.js";
import flagRoutes from "./routes/flag.routes.js";
import schoolRoutes from "./routes/school.routes.js";
import batchRoutes from "./routes/batch.routes.js";
import divisionRoutes from "./routes/division.routes.js";
import semesterRoutes from "./routes/semester.routes.js";
import studentRoutes from "./routes/student.routes.js";
import teacherRoutes from "./routes/teacher.routes.js";
import studentProfileRoutes from "./routes/studentprofile.routes.js";
import studentAttendanceRoutes from "./routes/studentattendance.routes.js";
import studentAcademicsRoutes from "./routes/studentAcademics.routes.js";
import subjectRoutes from "./routes/subject.routes.js";
import examRoutes from "./routes/exam.routes.js";
import teacherCourseRoutes from "./routes/teacherCourse.routes.js";
import teacherAttendanceRoutes from "./routes/teacherAttendance.routes.js";
import roomRoutes from "./routes/room.routes.js";
import classRoutes from "./routes/class.routes.js";
import policyRoutes from "./routes/policy.routes.js";
import jobRoutes from "./routes/job.routes.js";

const app = express();
const PORT = process.env.PORT ?? 8000;

app.use(cors({
    origin: process.env.ORIGIN,
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter)
app.use('/api/superadmin', superadminrouter)
app.use('/api/admin',adminRouter)
app.use('/api/center',centerRouter)
app.use('/api/post',engagementRouter)
app.use('/api/media',mediaRouter)
app.use('/api/comments', commentRoutes);
app.use('/api/likes', likesRouter);
app.use('/api/flags', flagRoutes);
app.use('/api/schools',schoolRoutes);
app.use('/api/batches',batchRoutes);
app.use('/api/division',divisionRoutes);
app.use('/api/semester',semesterRoutes)
app.use('/api/students',studentRoutes)
app.use('/api/teachers',teacherRoutes)
app.use('/api/students-profile',studentProfileRoutes)
app.use("/api/student-attendance",studentAttendanceRoutes)
app.use("/api/student-academics",studentAcademicsRoutes)
app.use("/api/subjects",subjectRoutes)
app.use("/api/exams",examRoutes)
app.use("/api/teacher-courses",teacherCourseRoutes)
app.use("/api/teacher-attendance",teacherAttendanceRoutes)
app.use("/api/rooms",roomRoutes)
app.use("/api/class",classRoutes)
app.use("/api/policy",policyRoutes)
app.use("/api/job",jobRoutes)



app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.use(globalErrorHandler);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
