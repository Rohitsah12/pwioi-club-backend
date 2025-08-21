import { z } from 'zod';

// Schema for a single scheduled class within the weekly template
const scheduleItemSchema = z.object({
  day_of_week: z.enum(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  lecture_number: z.string().min(1, 'Lecture number is required'), // Changed to string to match schema
}).refine(data => data.start_time < data.end_time, {
  message: 'End time must be after start time for a schedule item',
  path: ['end_time'],
});

// Main schema for creating classes in bulk over a date range
export const createWeeklyScheduleSchema = z.object({
  subject_id: z.string().uuid('Invalid Subject ID format'),
  room_id: z.string().uuid('Invalid Room ID format').optional(),
  start_date: z.string().date('Invalid start date format. Use YYYY-MM-DD.'),
  end_date: z.string().date('Invalid end date format. Use YYYY-MM-DD.'),
  schedule_items: z.array(scheduleItemSchema).min(1, 'At least one schedule item is required'),
}).refine(data => new Date(data.start_date) <= new Date(data.end_date), {
  message: 'End date must be on or after the start date',
  path: ['end_date'],
});

// Schema for updating a single existing class - Updated to match database schema
export const updateClassSchema = z.object({
  lecture_number: z.string().min(1, 'Lecture number is required').optional(), // Changed to string
  start_date: z.string().datetime('Invalid start date format. Use ISO datetime.').optional(), // Changed to datetime
  end_date: z.string().datetime('Invalid end date format. Use ISO datetime.').optional(), // Changed to datetime
  room_id: z.string().uuid('Invalid Room ID format').optional(),
  googleEventId: z.string().optional(),
}).refine(data => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) < new Date(data.end_date);
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['end_date'],
});