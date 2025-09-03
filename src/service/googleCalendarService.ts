import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../utils/AppError.js';

interface EventDetails {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: Date;
  endDateTime: Date;
  attendees?: string[]; // List of student emails
  teacherEmail: string;  // Teacher's email is now required
}

// Interface for updating events
interface UpdateEventDetails {
  summary?: string;
  description?: string;
  location?: string;
  startDateTime?: Date;
  endDateTime?: Date;
  attendees?: string[]; // Student emails
  teacherEmail?: string; // Teacher email
}


class GoogleCalendarService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    if (!process.env.GOOGLE_ACADEMICS_REFRESH_TOKEN) {
      console.warn('GOOGLE_ACADEMICS_REFRESH_TOKEN is not set. Google Calendar integration is disabled.');
    } else {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_ACADEMICS_REFRESH_TOKEN,
      });
    }
  }

 
  private getCalendarClient() {
    if (!this.oauth2Client.credentials.refresh_token) {
        throw new AppError('Google Calendar service is not configured.', 500);
    }
    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Create a calendar event with academics.ioi@pw.live as the organizer.
   */
  async createCalendarEvent(eventDetails: EventDetails): Promise<string> {
    const calendar = this.getCalendarClient();


    const attendeesList = [
      { email: eventDetails.teacherEmail } 
    ];
    if (eventDetails.attendees) {
      attendeesList.push(...eventDetails.attendees.map(email => ({ email })));
    }

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
      attendees: attendeesList,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 15 },
          { method: 'email', minutes: 30 },
        ],
      },
      colorId: '2', // Green
    };

    try {
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        sendNotifications: true, // Send invites to attendees
      });
      return response.data.id!;
    } catch (error: any) {
      console.error('Google Calendar API Error:', error.response?.data || error.message);
      throw new AppError(`Failed to create calendar event: ${error.message}`, 500);
    }
  }

  /**
   * Update a calendar event
   */
  async updateCalendarEvent(
    eventId: string,
    eventDetails: Partial<UpdateEventDetails>
  ): Promise<void> {
    const calendar = this.getCalendarClient();
    
    const eventPatch: any = {};
    if (eventDetails.summary) eventPatch.summary = eventDetails.summary;
    if (eventDetails.description) eventPatch.description = eventDetails.description;
    if (eventDetails.location) eventPatch.location = eventDetails.location;
    if (eventDetails.startDateTime) eventPatch.start = { dateTime: eventDetails.startDateTime.toISOString(), timeZone: 'Asia/Kolkata' };
    if (eventDetails.endDateTime) eventPatch.end = { dateTime: eventDetails.endDateTime.toISOString(), timeZone: 'Asia/Kolkata' };
    
    // If updating attendees, the full list must be provided.
    if (eventDetails.attendees && eventDetails.teacherEmail) {
        const attendeesList = [{ email: eventDetails.teacherEmail }];
        attendeesList.push(...eventDetails.attendees.map(email => ({ email })));
        eventPatch.attendees = attendeesList;
    }

    try {
      await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: eventPatch,
        sendNotifications: true,
      });
    } catch (error: any) {
      console.error('Google Calendar API Error:', error.response?.data || error.message);
      throw new AppError(`Failed to update calendar event: ${error.message}`, 500);
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(eventId: string): Promise<void> {
    const calendar = this.getCalendarClient();

    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendNotifications: true,
      });
    } catch (error: any) {
      if (error.code === 410) { // Event already gone
        console.warn(`Event ${eventId} was already deleted from Google Calendar.`);
        return;
      }
      console.error('Google Calendar API Error:', error.response?.data || error.message);
      throw new AppError(`Failed to delete calendar event: ${error.message}`, 500);
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();