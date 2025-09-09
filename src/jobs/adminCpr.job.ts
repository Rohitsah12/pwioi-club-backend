// src/jobs/adminWeeklyReport.job.ts

import { prisma } from "../db/prisma.js";
import { sendEmail } from "../service/email.service.js";
import { calculateCprSummaryForSubject } from "../service/cpr.service.js";
import type { CprModule, Subject } from "@prisma/client";

// Define a more specific type for the data we fetch
interface CprModuleWithTopics extends CprModule {
  topics: {
    subTopics: any[]
  }[];
}

/**
 * Main function to generate and send the weekly CPR report to admins.
 */
export async function sendAdminWeeklyCprReport() {
  console.log("Starting Admin Weekly CPR Report job...");

  const adminRecipients = process.env.ADMIN_EMAIL_RECIPIENTS;
  if (!adminRecipients) {
    console.error("ADMIN_EMAIL_RECIPIENTS environment variable not set. Aborting job.");
    return;
  }

  const adminEmailList = adminRecipients.split(',').map(email => email.trim());
  if (adminEmailList.length === 0) {
    console.log("No admin recipients configured.");
    return;
  }

  // --- PERFORMANCE REFACTOR ---
  // Fetch all required data in a single, efficient query.
  const today = new Date();
  const allOngoingSubjects = await prisma.subject.findMany({
    where: {
      semester: {
        start_date: { lte: today },
        end_date: { gte: today },
      },
    },
    include: {
      teacher: true,
      cprModules: {
        include: {
          topics: {
            include: { subTopics: true }
          }
        }
      },
      semester: {
        include: {
          division: {
            include: {
              school: {
                include: { center: true }
              }
            }
          }
        }
      }
    }
  });

  if (allOngoingSubjects.length === 0) {
    console.log("No ongoing subjects found to report.");
    return;
  }
  
  // Transform the flat list of subjects into a nested structure for the report
  const reportData = transformSubjectsToReportData(allOngoingSubjects);

  const reportHtml = buildAdminReportHtml(reportData);
  
  await sendEmail({
    to: adminEmailList,
    subject: `Weekly CPR Progress Report - ${today.toLocaleDateString()}`,
    htmlBody: reportHtml,
  });

  console.log("Admin Weekly CPR Report job finished.");
}

/**
 * Transforms a flat array of subjects into a nested structure grouped by center and school.
 */
function transformSubjectsToReportData(subjects: any[]) {
    const centersMap = new Map();
  
    for (const subject of subjects) {
      const center = subject.semester.division.school.center;
      const school = subject.semester.division.school;
  
      if (!centersMap.has(center.id)) {
        centersMap.set(center.id, { name: center.name, schools: new Map() });
      }
  
      const centerData = centersMap.get(center.id);
      if (!centerData.schools.has(school.id)) {
        centerData.schools.set(school.id, { name: school.name, subjects: [] });
      }
  
      const schoolData = centerData.schools.get(school.id);
      const summary = calculateCprSummaryForSubject(subject.cprModules as CprModuleWithTopics[], subject);
      schoolData.subjects.push(summary);
    }
  
    // Convert maps to arrays for the final report structure
    const finalReport: any[] = [];
    for (const center of centersMap.values()) {
      center.schools = Array.from(center.schools.values());
      finalReport.push(center);
    }
    return finalReport;
}


/**
 * Builds the HTML for the admin report email.
 */
function buildAdminReportHtml(data: any[]): string {
  let reportBody = "";

  for (const center of data) {
    reportBody += `<h2 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 5px;">${center.name}</h2>`;
    for (const school of center.schools) {
      reportBody += `<h3 style="color: #555; margin-left: 20px;">${school.name}</h3>`;
      reportBody += `<table style="width: 90%; margin-left: 40px; border-collapse: collapse; margin-bottom: 20px;">
        <thead style="background-color: #f2f2f2;">
          <tr>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Subject (Teacher)</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Expected</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Actual</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Pacing</th>
          </tr>
        </thead>
        <tbody>`;

      for (const subject of school.subjects) {
        const lag = subject.completion_lag;
        let pacingText;
        let lagColor;

        if (lag > 1) {
          pacingText = `${lag.toFixed(1)} behind`;
          lagColor = '#D32F2F'; // Red
        } else if (lag < -1) {
          pacingText = `${Math.abs(lag).toFixed(1)} ahead`;
          lagColor = '#388E3C'; // Green
        } else {
          pacingText = 'On track';
          lagColor = '#333'; // Black
        }

        reportBody += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${subject.subject_name} (${subject.teacher_name})</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${subject.expected_completion_lecture}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${subject.actual_completion_lecture}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: ${lagColor};">
              ${pacingText}
            </td>
          </tr>`;
      }
      reportBody += `</tbody></table>`;
    }
  }

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h1>Weekly CPR Progress Report</h1>
      <p>Here is the summary of course progress for all ongoing subjects as of ${new Date().toDateString()}.</p>
      <hr>
      ${reportBody}
      <hr>
      <p style="font-size: 12px; color: #888;">This is an automated report.</p>
    </div>`;
}