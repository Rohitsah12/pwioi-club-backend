import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const sesClient = new SESv2Client({ region: "ap-south-1" });

interface EmailParams {
  to: string;
  subject: string;
  htmlBody: string;
}

export async function sendEmail({ to, subject, htmlBody }: EmailParams) {
  const command = new SendEmailCommand({
    FromEmailAddress: "notifications@your-school.com", 
    Destination: {
      ToAddresses: [to],
    },
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
    console.log(`Email sent to ${to}. Message ID: ${response.MessageId}`);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    return { success: false, error };
  }
}
