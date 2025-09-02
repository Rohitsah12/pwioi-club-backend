import { SESv2Client, SendEmailCommand} from "@aws-sdk/client-sesv2";
import type { Destination } from "@aws-sdk/client-sesv2";

const sesClient = new SESv2Client({ region: "ap-south-1" });

interface EmailParams {
  to: string | string[]; 
  subject: string;
  htmlBody: string;
}

export async function sendEmail({ to, subject, htmlBody }: EmailParams) {
  const ccEmail = process.env.CPR_REMINDER_CC_EMAIL;

  const destination: Destination = {
    ToAddresses: Array.isArray(to) ? to : [to],
  };

  if (ccEmail) {
    destination.CcAddresses = [ccEmail];
    console.log(`Sending email with CC to: ${ccEmail}`);
  }

  const command = new SendEmailCommand({
    FromEmailAddress: process.env.SES_VERIFIED_EMAIL!,
    Destination: destination,
    Content: {
      Simple: {
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
    },
  });

  try {
    const response = await sesClient.send(command);
    console.log(`Email sent to ${Array.isArray(to) ? to.join(', ') : to}. Message ID: ${response.MessageId}`);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error(`Failed to send email to ${Array.isArray(to) ? to.join(', ') : to}:`, error);
    return { success: false, error };
  }
}

