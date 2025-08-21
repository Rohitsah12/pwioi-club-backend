import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';
import { addMinutes, format } from 'date-fns';

interface EventDetails {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: Date;
  endDateTime: Date;
  attendees?: string[];
}

class GoogleCalendarService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Get authenticated Calendar client for a teacher
   */
  private async getCalendarClient(teacherId: string) {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { googleRefreshToken: true, email: true }
    });

    if (!teacher || !teacher.googleRefreshToken) {
      throw new AppError('Teacher not found or Google Calendar not connected', 404);
    }

    this.oauth2Client.setCredentials({
      refresh_token: teacher.googleRefreshToken
    });

    // Listen for token refresh
    this.oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        await prisma.teacher.update({
          where: { id: teacherId },
          data: { googleRefreshToken: tokens.refresh_token }
        });
      }
    });

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Create a calendar event
   */
  async createCalendarEvent(teacherId: string, eventDetails: EventDetails): Promise<string> {
    const calendar = await this.getCalendarClient(teacherId);

    const event = {
      summary: eventDetails.summary,
      description: eventDetails.description || '',
      location: eventDetails.location || '',
      start: {
        dateTime: eventDetails.startDateTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: eventDetails.endDateTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      attendees: eventDetails.attendees?.map(email => ({ email })) || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 15 },
          { method: 'email', minutes: 30 },
        ],
      },
      colorId: '2', // Green color for classes
    };

    try {
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        sendNotifications: true,
      });

      return response.data.id!;
    } catch (error: any) {
      console.error('Google Calendar API Error:', error);
      throw new AppError(`Failed to create calendar event: ${error.message}`, 500);
    }
  }

  /**
   * Update a calendar event
   */
  async updateCalendarEvent(
    teacherId: string,
    eventId: string,
    eventDetails: EventDetails
  ): Promise<void> {
    const calendar = await this.getCalendarClient(teacherId);

    const event = {
      summary: eventDetails.summary,
      description: eventDetails.description || '',
      location: eventDetails.location || '',
      start: {
        dateTime: eventDetails.startDateTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: eventDetails.endDateTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      attendees: eventDetails.attendees?.map(email => ({ email })) || [],
    };

    try {
      await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: event,
        sendNotifications: true,
      });
    } catch (error: any) {
      console.error('Google Calendar API Error:', error);
      throw new AppError(`Failed to update calendar event: ${error.message}`, 500);
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(teacherId: string, eventId: string): Promise<void> {
    const calendar = await this.getCalendarClient(teacherId);

    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendNotifications: true,
      });
    } catch (error: any) {
      console.error('Google Calendar API Error:', error);
      throw new AppError(`Failed to delete calendar event: ${error.message}`, 500);
    }
  }

  /**
   * Check if time slot is available in teacher's calendar
   */
  async isTimeSlotAvailable(
    teacherId: string,
    startDateTime: Date,
    endDateTime: Date,
    excludeEventId?: string
  ): Promise<boolean> {
    const calendar = await this.getCalendarClient(teacherId);

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startDateTime.toISOString(),
        timeMax: endDateTime.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const conflictingEvents = response.data.items?.filter(event => {
        // Exclude the event being updated
        if (excludeEventId && event.id === excludeEventId) {
          return false;
        }
        
        // Check for time conflicts
        const eventStart = new Date(event.start?.dateTime || event.start?.date!);
        const eventEnd = new Date(event.end?.dateTime || event.end?.date!);
        
        return (
          (startDateTime < eventEnd && endDateTime > eventStart) ||
          (eventStart < endDateTime && eventEnd > startDateTime)
        );
      });

      return !conflictingEvents || conflictingEvents.length === 0;
    } catch (error: any) {
      console.error('Google Calendar API Error:', error);
      throw new AppError(`Failed to check calendar availability: ${error.message}`, 500);
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();
