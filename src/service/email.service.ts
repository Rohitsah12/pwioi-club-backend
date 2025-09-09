import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import 'dotenv/config';

const sesClient = new SESClient({});

interface EmailParams {
  to: string | string[];
  subject: string;
  htmlBody: string;
}

export async function sendEmail({ to, subject, htmlBody }: EmailParams) {
  const senderEmail = process.env.SENDER_EMAIL_ADDRESS;
  if (!senderEmail) {
    console.error("SENDER_EMAIL_ADDRESS environment variable is not set.");
    throw new Error("Sender email address is not configured.");
  }

  const toAddresses = Array.isArray(to) ? to : [to];

  if (toAddresses.length === 0) {
    console.log("No recipients provided, skipping email send.");
    return;
  }

  const command = new SendEmailCommand({
    Source: senderEmail,
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: "UTF-8",
        },
      },
    },
  });

  try {
    const response = await sesClient.send(command);
    console.log(`Email sent successfully to ${toAddresses.join(', ')}. Message ID: ${response.MessageId}`);
    return response;
  } catch (error) {
    console.error(`Failed to send email to ${toAddresses.join(', ')}:`, error);
    throw error;
  }
}