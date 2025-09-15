import { z } from 'zod';

// Days of the week enum for validation
const daysOfWeek = z.enum(
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    { message: 'Day of the week is required.' }
);

// Time format regex for validation
const timeFormat = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

// Main schema for creating classes in bulk over a date range
export const createWeeklyScheduleSchema = z.object({
    subject_id: z.string({ message: 'Subject ID is required.' }).min(1, { message: 'Subject ID is required.' }).uuid({ message: 'Invalid Subject ID format.' }),
    room_id: z.string().uuid({ message: 'Invalid Room ID format.' }).optional().nullable(),
    start_date: z.string({ message: 'Start date is required.' }).datetime({ message: 'Invalid start date format.' }),
    end_date: z.string({ message: 'End date is required.' }).datetime({ message: 'Invalid end date format.' }),
    schedule_items: z.array(
        z.object({
            day_of_week: daysOfWeek,
            start_time: z.string({ message: 'Start time is required.' }).regex(timeFormat, 'Invalid start time format (HH:MM)'),
            end_time: z.string({ message: 'End time is required.' }).regex(timeFormat, 'Invalid end time format (HH:MM)'),
            lecture_number: z.number({ message: 'Lecture number must be a number.' }).int().positive({ message: 'Lecture number must be a positive integer.' }),
        }).refine(data => data.start_time < data.end_time, {
            message: 'End time must be after start time for a schedule item.',
            path: ['end_time'],
        })
    ).min(1, { message: 'At least one schedule item is required.' }),
}).refine(data => new Date(data.start_date) < new Date(data.end_date), {
    message: 'The schedule end date must be after the start date.',
    path: ['end_date'],
});

// Schema for updating a single existing class
export const updateClassSchema = z.object({
    lecture_number: z.string({ message: 'Lecture number must be a string.' }).optional(),
    start_date: z.string().datetime({ message: 'Invalid start date format.' }).optional(),
    end_date: z.string().datetime({ message: 'Invalid end date format.' }).optional(),
    room_id: z.string().uuid({ message: 'Invalid Room ID format.' }).optional().nullable(),
}).partial().refine(data => {
    // Ensure that if both dates are provided, start_date is before end_date
    if (data.start_date && data.end_date) {
        return new Date(data.start_date) < new Date(data.end_date);
    }
    return true;
}, {
    message: 'End date must be after start date.',
    path: ['end_date'],
});