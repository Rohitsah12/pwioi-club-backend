// import type { Request, Response } from 'express';
// import { prisma } from '../db/prisma.js';
// import { catchAsync } from '../utils/catchAsync.js';
// import { AppError } from '../utils/AppError.js';
// import { googleCalendarService } from '../service/googleCalendarService.js';
// import { z } from 'zod';
// import { addMinutes, format, isBefore, parse, startOfDay } from 'date-fns';

// // ==================== VALIDATION SCHEMAS ====================

// const createClassSchema = z.object({
//   subject_id: z.string().min(1, 'Subject ID is required'),
//   room_id: z.string().optional(),
//   date: z.string().refine((date) => !isNaN(new Date(date).getTime()), 'Invalid date format'),
//   start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
//   end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
//   topic: z.string().optional(),
//   lecture_number: z.number().int().positive().optional(),
// });

// const updateClassSchema = z.object({
//   subject_id: z.string().optional(),
//   room_id: z.string().optional(),
//   date: z.string().refine((date) => !isNaN(new Date(date).getTime()), 'Invalid date format').optional(),
//   start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)').optional(),
//   end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)').optional(),
//   topic: z.string().optional(),
//   lecture_number: z.number().int().positive().optional(),
//   is_cancelled: z.boolean().optional(),
// });

// // ==================== UTILITY FUNCTIONS ====================

// function parseDateTime(date: string, time: string): Date {
//   const dateObj = new Date(date);
//   const [hours, minutes] = time.split(':').map(Number);
//   dateObj.setHours(hours, minutes, 0, 0);
//   return dateObj;
// }

// function validateClassTiming(startDateTime: Date, endDateTime: Date): void {
//   const now = new Date();
//   const cutoffTime = new Date();
//   cutoffTime.setHours(8, 0, 0, 0); // 8:00 AM cutoff

//   if (startDateTime <= now) {
//     throw new AppError('Cannot schedule classes in the past', 400);
//   }

//   if (startDateTime >= endDateTime) {
//     throw new AppError('End time must be after start time', 400);
//   }

//   // If scheduling for today, check 8 AM cutoff
//   if (startOfDay(startDateTime).getTime() === startOfDay(now).getTime()) {
//     if (now > cutoffTime) {
//       throw new AppError('Cannot schedule classes for today after 8:00 AM', 400);
//     }
//   }
// }

// // ==================== CONTROLLERS ====================

// /**
//  * @desc    Create a new class with Google Calendar integration
//  * @route   POST /api/classes
//  * @access  Private (Teacher, Admin)
//  */
// export const createClass = catchAsync(async (req: Request, res: Response) => {
//   const { sub: userId, role } = req.user!;
  
//   const validation = createClassSchema.safeParse(req.body);
//   if (!validation.success) {
//     return res.status(400).json({
//       success: false,
//       message: 'Validation error',
//       errors: validation.error.format()
//     });
//   }

//   const { subject_id, room_id, date, start_time, end_time, topic, lecture_number } = validation.data;

//   // Parse date and time
//   const startDateTime = parseDateTime(date, start_time);
//   const endDateTime = parseDateTime(date, end_time);

//   // Validate timing
//   validateClassTiming(startDateTime, endDateTime);

//   // Verify subject exists and get teacher info
//   const subject = await prisma.subject.findUnique({
//     where: { id: subject_id },
//     include: {
//       teacher: {
//         select: {
//           id: true,
//           name: true,
//           email: true,
//           google_refresh_token: true
//         }
//       },
//       semester: {
//         include: {
//           division: {
//             include: {
//               students: {
//                 where: { is_active: true },
//                 select: { email: true }
//               }
//             }
//           }
//         }
//       }
//     }
//   });

//   if (!subject) {
//     throw new AppError('Subject not found', 404);
//   }

//   // Check if user is authorized (teacher of the subject or admin)
//   const teacherId = subject.teacher.id;
//   if (role === 'TEACHER' && userId !== teacherId) {
//     throw new AppError('You can only create classes for your subjects', 403);
//   }

//   // Verify room exists and is available
//   if (room_id) {
//     const room = await prisma.room.findUnique({
//       where: { id: room_id },
//       select: { id: true, room_number: true, building: true, is_active: true }
//     });

//     if (!room || !room.is_active) {
//       throw new AppError('Room not found or inactive', 404);
//     }

//     // Check room availability (no overlapping classes)
//     const conflictingClass = await prisma.class.findFirst({
//       where: {
//         room_id: room_id,
//         date: startDateTime,
//         is_cancelled: false,
//         OR: [
//           {
//             AND: [
//               { start_time: { lte: start_time } },
//               { end_time: { gt: start_time } }
//             ]
//           },
//           {
//             AND: [
//               { start_time: { lt: end_time } },
//               { end_time: { gte: end_time } }
//             ]
//           }
//         ]
//       }
//     });

//     if (conflictingClass) {
//       throw new AppError('Room is not available at this time', 409);
//     }
//   }

//   // Check teacher's Google Calendar availability
//   let googleEventId: string | null = null;
  
//   if (subject.teacher.google_refresh_token) {
//     const isAvailable = await googleCalendarService.isTimeSlotAvailable(
//       teacherId,
//       startDateTime,
//       endDateTime
//     );

//     if (!isAvailable) {
//       throw new AppError('Teacher has conflicting events in Google Calendar', 409);
//     }

//     // Create Google Calendar event
//     try {
//       const eventDetails = {
//         summary: `${subject.name} - ${topic || 'Class'}`,
//         description: `
// Subject: ${subject.name}
// Topic: ${topic || 'Class'}
// Lecture: ${lecture_number || 'N/A'}
// Division: ${subject.semester.division.code}
//         `.trim(),
//         location: room_id ? `Room ${await getRoomDetails(room_id)}` : 'TBD',
//         startDateTime,
//         endDateTime,
//         attendees: subject.semester.division.students.map(student => student.email).filter(Boolean)
//       };

//       googleEventId = await googleCalendarService.createCalendarEvent(teacherId, eventDetails);
//     } catch (calendarError) {
//       console.error('Google Calendar creation failed:', calendarError);
//       // Continue without calendar integration but log the error
//     }
//   }

//   // Create class in database
//   const newClass = await prisma.class.create({
//     data: {
//       subject_id,
//       room_id: room_id || null,
//       date: startDateTime,
//       start_time,
//       end_time,
//       topic,
//       lecture_number,
//       google_event_id: googleEventId
//     },
//     include: {
//       subject: {
//         select: { name: true, code: true }
//       },
//       room: {
//         select: { room_number: true, building: true }
//       }
//     }
//   });

//   res.status(201).json({
//     success: true,
//     message: 'Class created successfully',
//     data: newClass,
//     calendar_integrated: !!googleEventId
//   });
// });

// /**
//  * @desc    Update a class
//  * @route   PUT /api/classes/:classId
//  * @access  Private (Teacher, Admin)
//  */
// export const updateClass = catchAsync(async (req: Request, res: Response) => {
//   const { classId } = req.params;
//   const { sub: userId, role } = req.user!;

//   if (!classId) {
//     throw new AppError('Class ID is required', 400);
//   }

//   const validation = updateClassSchema.safeParse(req.body);
//   if (!validation.success) {
//     return res.status(400).json({
//       success: false,
//       message: 'Validation error',
//       errors: validation.error.format()
//     });
//   }

//   const updateData = validation.data;

//   // Get existing class
//   const existingClass = await prisma.class.findUnique({
//     where: { id: classId },
//     include: {
//       subject: {
//         include: {
//           teacher: {
//             select: {
//               id: true,
//               name: true,
//               email: true,
//               google_refresh_token: true
//             }
//           },
//           semester: {
//             include: {
//               division: {
//                 include: {
//                   students: {
//                     where: { is_active: true },
//                     select: { email: true }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       },
//       room: true
//     }
//   });

//   if (!existingClass) {
//     throw new AppError('Class not found', 404);
//   }

//   // Check authorization
//   const teacherId = existingClass.subject.teacher.id;
//   if (role === 'TEACHER' && userId !== teacherId) {
//     throw new AppError('You can only update your own classes', 403);
//   }

//   // Time-based validation for updates
//   const now = new Date();
//   const cutoffTime = new Date();
//   cutoffTime.setHours(8, 0, 0, 0);

//   const classDate = new Date(existingClass.date);
//   const isToday = startOfDay(classDate).getTime() === startOfDay(now).getTime();

//   if (classDate < now || (isToday && now > cutoffTime)) {
//     throw new AppError('Cannot update classes that have started or past the 8:00 AM cutoff for today', 400);
//   }

//   // Parse new date/time if provided
//   let newStartDateTime = new Date(existingClass.date);
//   let newEndDateTime = new Date(existingClass.date);

//   if (updateData.date) {
//     newStartDateTime = parseDateTime(updateData.date, updateData.start_time || existingClass.start_time);
//     newEndDateTime = parseDateTime(updateData.date, updateData.end_time || existingClass.end_time);
//   } else {
//     if (updateData.start_time) {
//       newStartDateTime = parseDateTime(format(classDate, 'yyyy-MM-dd'), updateData.start_time);
//     }
//     if (updateData.end_time) {
//       newEndDateTime = parseDateTime(format(classDate, 'yyyy-MM-dd'), updateData.end_time);
//     }
//   }

//   // Validate new timing
//   if (updateData.date || updateData.start_time || updateData.end_time) {
//     validateClassTiming(newStartDateTime, newEndDateTime);
//   }

//   // Check room availability if room is being changed
//   if (updateData.room_id) {
//     const room = await prisma.room.findUnique({
//       where: { id: updateData.room_id },
//       select: { id: true, room_number: true, building: true, is_active: true }
//     });

//     if (!room || !room.is_active) {
//       throw new AppError('Room not found or inactive', 404);
//     }

//     // Check for conflicts
//     const conflictingClass = await prisma.class.findFirst({
//       where: {
//         room_id: updateData.room_id,
//         date: newStartDateTime,
//         is_cancelled: false,
//         id: { not: classId }, // Exclude current class
//         OR: [
//           {
//             AND: [
//               { start_time: { lte: updateData.start_time || existingClass.start_time } },
//               { end_time: { gt: updateData.start_time || existingClass.start_time } }
//             ]
//           },
//           {
//             AND: [
//               { start_time: { lt: updateData.end_time || existingClass.end_time } },
//               { end_time: { gte: updateData.end_time || existingClass.end_time } }
//             ]
//           }
//         ]
//       }
//     });

//     if (conflictingClass) {
//       throw new AppError('Room is not available at this time', 409);
//     }
//   }

//   // Update Google Calendar event if integrated
//   if (existingClass.google_event_id && existingClass.subject.teacher.google_refresh_token) {
//     try {
//       // Check calendar availability for new time
//       const isAvailable = await googleCalendarService.isTimeSlotAvailable(
//         teacherId,
//         newStartDateTime,
//         newEndDateTime,
//         existingClass.google_event_id
//       );

//       if (!isAvailable) {
//         throw new AppError('Teacher has conflicting events in Google Calendar', 409);
//       }

//       // Update calendar event
//       const eventDetails = {
//         summary: `${existingClass.subject.name} - ${updateData.topic || existingClass.topic || 'Class'}`,
//         description: `
// Subject: ${existingClass.subject.name}
// Topic: ${updateData.topic || existingClass.topic || 'Class'}
// Lecture: ${updateData.lecture_number || existingClass.lecture_number || 'N/A'}
// Division: ${existingClass.subject.semester.division.code}
//         `.trim(),
//         location: updateData.room_id ? `Room ${await getRoomDetails(updateData.room_id)}` : 
//                  existingClass.room_id ? `Room ${await getRoomDetails(existingClass.room_id)}` : 'TBD',
//         startDateTime: newStartDateTime,
//         endDateTime: newEndDateTime,
//         attendees: existingClass.subject.semester.division.students.map(student => student.email).filter(Boolean)
//       };

//       await googleCalendarService.updateCalendarEvent(
//         teacherId,
//         existingClass.google_event_id,
//         eventDetails
//       );
//     } catch (calendarError) {
//       console.error('Google Calendar update failed:', calendarError);
//       // Continue with database update but warn about calendar sync
//     }
//   }

//   // Update class in database
//   const updatedClass = await prisma.class.update({
//     where: { id: classId },
//     data: {
//       ...updateData,
//       date: updateData.date ? newStartDateTime : undefined,
//       updatedAt: new Date()
//     },
//     include: {
//       subject: {
//         select: { name: true, code: true }
//       },
//       room: {
//         select: { room_number: true, building: true }
//       }
//     }
//   });

//   res.status(200).json({
//     success: true,
//     message: 'Class updated successfully',
//     data: updatedClass
//   });
// });

// /**
//  * @desc    Delete a class
//  * @route   DELETE /api/classes/:classId
//  * @access  Private (Teacher, Admin)
//  */
// export const deleteClass = catchAsync(async (req: Request, res: Response) => {
//   const { classId } = req.params;
//   const { sub: userId, role } = req.user!;

//   if (!classId) {
//     throw new AppError('Class ID is required', 400);
//   }

//   // Get existing class
//   const existingClass = await prisma.class.findUnique({
//     where: { id: classId },
//     include: {
//       subject: {
//         include: {
//           teacher: {
//             select: {
//               id: true,
//               google_refresh_token: true
//             }
//           }
//         }
//       }
//     }
//   });

//   if (!existingClass) {
//     throw new AppError('Class not found', 404);
//   }

//   // Check authorization
//   const teacherId = existingClass.subject.teacher.id;
//   if (role === 'TEACHER' && userId !== teacherId) {
//     throw new AppError('You can only delete your own classes', 403);
//   }

//   // Time-based validation for deletion
//   const now = new Date();
//   const cutoffTime = new Date();
//   cutoffTime.setHours(8, 0, 0, 0);

//   const classDate = new Date(existingClass.date);
//   const isToday = startOfDay(classDate).getTime() === startOfDay(now).getTime();

//   if (classDate < now || (isToday && now > cutoffTime)) {
//     throw new AppError('Cannot delete classes that have started or past the 8:00 AM cutoff for today', 400);
//   }

//   // Delete from Google Calendar if integrated
//   if (existingClass.google_event_id && existingClass.subject.teacher.google_refresh_token) {
//     try {
//       await googleCalendarService.deleteCalendarEvent(
//         teacherId,
//         existingClass.google_event_id
//       );
//     } catch (calendarError) {
//       console.error('Google Calendar deletion failed:', calendarError);
//       // Continue with database deletion
//     }
//   }

//   // Delete from database
//   await prisma.class.delete({
//     where: { id: classId }
//   });

//   res.status(200).json({
//     success: true,
//     message: 'Class deleted successfully',
//     data: {
//       id: existingClass.id,
//       subject: existingClass.subject.name,
//       date: existingClass.date,
//       start_time: existingClass.start_time,
//       end_time: existingClass.end_time
//     }
//   });
// });

// /**
//  * @desc    Get teacher's weekly schedule
//  * @route   GET /api/classes/schedule/weekly?week_start=2025-08-18
//  * @access  Private (Teacher)
//  */
// export const getWeeklySchedule = catchAsync(async (req: Request, res: Response) => {
//   const { sub: teacherId } = req.user!;
//   const { week_start } = req.query;

//   if (!week_start || typeof week_start !== 'string') {
//     throw new AppError('Week start date is required (YYYY-MM-DD format)', 400);
//   }

//   const startDate = new Date(week_start);
//   const endDate = new Date(startDate);
//   endDate.setDate(endDate.getDate() + 6); // 7 days total

//   if (isNaN(startDate.getTime())) {
//     throw new AppError('Invalid week start date format', 400);
//   }

//   // Get all subjects taught by this teacher
//   const teacherSubjects = await prisma.subject.findMany({
//     where: { teacher_id: teacherId },
//     select: { id: true }
//   });

//   const subjectIds = teacherSubjects.map(s => s.id);

//   // Get classes for the week
//   const weeklyClasses = await prisma.class.findMany({
//     where: {
//       subject_id: { in: subjectIds },
//       date: {
//         gte: startDate,
//         lte: endDate
//       }
//     },
//     include: {
//       subject: {
//         select: {
//           name: true,
//           code: true
//         }
//       },
//       room: {
//         select: {
//           room_number: true,
//           building: true
//         }
//       }
//     },
//     orderBy: [
//       { date: 'asc' },
//       { start_time: 'asc' }
//     ]
//   });

//   // Group by day
//   const schedule = {};
//   const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
//   for (let i = 0; i < 7; i++) {
//     const currentDate = new Date(startDate);
//     currentDate.setDate(startDate.getDate() + i);
//     const dateKey = format(currentDate, 'yyyy-MM-dd');
//     const dayName = days[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1]; // Adjust for Monday start
    
//     schedule[dateKey] = {
//       date: dateKey,
//       day: dayName,
//       classes: weeklyClasses.filter(cls => format(new Date(cls.date), 'yyyy-MM-dd') === dateKey)
//     };
//   }

//   res.status(200).json({
//     success: true,
//     week_start: format(startDate, 'yyyy-MM-dd'),
//     week_end: format(endDate, 'yyyy-MM-dd'),
//     total_classes: weeklyClasses.length,
//     schedule
//   });
// });

// // ==================== HELPER FUNCTIONS ====================

// async function getRoomDetails(roomId: string): Promise<string> {
//   const room = await prisma.room.findUnique({
//     where: { id: roomId },
//     select: { room_number: true, building: true }
//   });
//   return room ? `${room.room_number}, ${room.building}` : 'Unknown Room';
// }
