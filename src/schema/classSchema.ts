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
    subject_id: z.string().uuid(),
    room_id: z.string().uuid().optional().nullable(),
    start_date: z.string().datetime(),
    end_date: z.string().datetime(),
    schedule_items: z.array(
        z.object({
            day_of_week: z.enum([
                'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
            ]),
            start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
            end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
            lecture_number: z.number().int().positive(),
        })
    ),
});

// Schema for updating a single existing class - Updated to match database schema
export const updateClassSchema = z.object({
    lecture_number: z.string().optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    room_id: z.string().uuid().optional().nullable(),
}).partial();