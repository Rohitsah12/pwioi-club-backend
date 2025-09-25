import { prisma } from "../db/prisma.js";
import { sendEmail } from "../service/email.service.js";
import { calculateCprSummaryForSubject } from "../service/cpr.service.js";
import type { CprModule } from "@prisma/client";

interface CprModuleWithTopics extends CprModule {
  topics: {
    subTopics: any[]
  }[];
}

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

  const today = new Date();
  
  // Only get subjects that have CPR modules (have uploaded CPR)
  const allOngoingSubjects = await prisma.subject.findMany({
    where: {
      semester: {
        start_date: { lte: today },
        OR: [
          { end_date: { gte: today } },
          { end_date: null },
        ],
      },
      cprModules: {
        some: {} // Only subjects that have at least one CPR module
      }
    },
    include: {
      teacher: true,
      cprModules: {
        include: {
          topics: {
            include: { 
              subTopics: {
                orderBy: { order: 'asc' }
              }
            },
            orderBy: { order: 'asc' }
          }
        },
        orderBy: { order: 'asc' }
      },
      semester: {
        include: {
          division: {
            include: {
              batch: true,
              school: {
                include: {
                  center: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (allOngoingSubjects.length === 0) {
    console.log("No ongoing subjects with CPR found to report.");
    return;
  }

  const reportData = transformSubjectsToReportData(allOngoingSubjects);
  const reportHtml = buildAdminReportHtml(reportData);

  await sendEmail({
    to: adminEmailList,
    subject: `Weekly CPR Progress Report - ${today.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    })}`,
    htmlBody: reportHtml,
  });

  console.log("Admin Weekly CPR Report job finished.");
}

function transformSubjectsToReportData(subjects: any[]) {
  const centersMap = new Map();

  for (const subject of subjects) {
    const center = subject.semester.division.school.center;
    const school = subject.semester.division.school;

    if (!centersMap.has(center.id)) {
      centersMap.set(center.id, {
        name: center.name,
        schools: new Map()
      });
    }

    const centerData = centersMap.get(center.id);
    if (!centerData.schools.has(school.id)) {
      centerData.schools.set(school.id, { name: school.name, subjects: [] });
    }

    const schoolData = centerData.schools.get(school.id);
    const summary = calculateCprSummaryForSubject(subject.cprModules as CprModuleWithTopics[], subject);
    
    // Calculate punctuality metrics
    const punctualityData = calculatePunctualityMetrics(subject.cprModules as CprModuleWithTopics[]);
    
    schoolData.subjects.push({
      ...summary,
      ...punctualityData
    });
  }

  const finalReport: any[] = [];
  for (const center of centersMap.values()) {
    center.schools = Array.from(center.schools.values());
    finalReport.push(center);
  }
  return finalReport;
}

function calculatePunctualityMetrics(cprModules: CprModuleWithTopics[]) {
  const allSubTopics = cprModules.flatMap(m => 
    m.topics.flatMap(t => t.subTopics)
  );
  
  let lateCount = 0;
  let totalWithDates = 0;
  
  for (const subTopic of allSubTopics) {
    if (subTopic.planned_start_date && subTopic.actual_start_date) {
      totalWithDates++;
      const plannedDate = new Date(subTopic.planned_start_date);
      const actualDate = new Date(subTopic.actual_start_date);
      
      // Reset time to compare only dates
      plannedDate.setHours(0, 0, 0, 0);
      actualDate.setHours(0, 0, 0, 0);
      
      if (actualDate > plannedDate) {
        lateCount++;
      }
    }
  }
  
  const punctualityPercentage = totalWithDates > 0 ? 
    ((totalWithDates - lateCount) / totalWithDates) * 100 : 100;
  
  return {
    punctuality_late_count: lateCount,
    total_scheduled_topics: totalWithDates,
    punctuality_percentage: parseFloat(punctualityPercentage.toFixed(1))
  };
}

function buildAdminReportHtml(data: any[]): string {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-IN', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });

  let reportBody = "";

  for (const center of data) {
    reportBody += `
      <!-- ${center.name} Section -->
      <div class="campus-section">
        <div class="campus-header">${center.name}</div>`;
    
    for (const school of center.schools) {
      const schoolBadgeClass = getSchoolBadgeClass(school.name);
      const schoolFullName = getSchoolFullName(school.name);
      
      reportBody += `
        <!-- ${schoolFullName} -->
        <div class="school-section">
          <div class="school-header">
            <div class="school-badge ${schoolBadgeClass} ">${school.name}</div>
            <div class="school-name">${schoolFullName}</div>
          </div>
          <table class="course-table">
            <thead>
              <tr>
                <th>Subject and Instructor</th>
                <th>Expected progress(lec)</th>
                <th>Actual progress(lec)</th>
                <th>Pacing Status</th>
                <th>Punctuality</th>
              </tr>
            </thead>
            <tbody>`;

      for (const subject of school.subjects) {
        const lag = subject.completion_lag;
        let pacingText, pacingClass;

        if (lag > 1) {
          pacingText = `Behind by ${Math.round(lag)} lectures`;
          pacingClass = 'status-behind';
        } else if (lag < -1) {
          pacingText = `Ahead by ${Math.abs(Math.round(lag))} lectures`;
          pacingClass = 'status-ahead'; // Using ontrack class for ahead status
        } else {
          pacingText = 'On Track';
          pacingClass = 'status-ontrack';
        }

        // Punctuality status
        let punctualityText, punctualityClass;
        if (subject.punctuality_late_count === 0) {
          punctualityText = `ON TIME (${Math.round(subject.punctuality_percentage)}%)`;
          punctualityClass = 'punctuality-ontime';
        } else {
          punctualityText = `${subject.punctuality_late_count} LATE (${Math.round(subject.punctuality_percentage)}%)`;
          punctualityClass = 'punctuality-late';
        }

        reportBody += `
              <tr>
                <td class="subject-cell">
                  ${subject.subject_name} (${subject.teacher_name})
                  <div class="course-code">${subject.division_identifier || 'N/A'}</div>
                </td>
                <td class="progress-cell">${subject.expected_completion_lecture}</td>
                <td class="progress-cell">${subject.actual_completion_lecture}</td>
                <td class="${pacingClass}">${pacingText}</td>
                <td class="${punctualityClass}">${punctualityText}</td>
              </tr>`;
      }
      
      reportBody += `
            </tbody>
          </table>
        </div>`;
    }
    reportBody += `
      </div>`;
  }

  return `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Course Progress Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #e8d5d5, #f0e8e8);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }

        .header {
            text-align: center;
            padding: 30px 20px;
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
        }

        .logo {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
        }

        .logo-circle {
            width: 40px;
            height: 40px;
            background: #333;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 18px;
        }

        .logo-text {
            font-weight: 700;
            font-size: 16px;
            color: #333;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .main-title {
            font-size: 28px;
            font-weight: 700;
            color: #333;
            margin-bottom: 8px;
        }

        .subtitle {
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }

        .report-date {
            background: #ffd700;
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            color: #333;
        }

        .campus-section {
            margin-bottom: 30px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .campus-header {
            background: #333;
            color: white;
            padding: 15px;
            text-align: center;
            font-size: 24px;
            font-weight: 700;
        }

        .school-section {
            margin-bottom: 20px;
        }

        .school-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 15px 20px;
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            border-left: 4px solid #007bff;
        }

        .school-badge {
            background: #007bff;
            margin-right:4px;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }

        .school-badge.som {
            background: #ff8c00;
        }

        .school-badge.soh {
            background: #00cc88;
        }

        .school-name {
            margin-top: 2px;
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }

        .course-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            background: white;
        }

        .course-table th {
            background: #f8f9fa;
            padding: 12px 10px;
            text-align: left;
            font-weight: 600;
            color: #333;
            border-bottom: 2px solid #dee2e6;
            font-size: 12px;
        }

        .course-table td {
            padding: 12px 10px;
            border-bottom: 1px solid #dee2e6;
            font-size: 11px;
        }

        .course-table tr:hover {
            background: #f8f9fa;
        }

        .subject-cell {
            font-weight: 500;
            color: #333;
            max-width: 250px;
        }

        .course-code {
            color: #666;
            font-size: 10px;
            margin-top: 2px;
        }

        .instructor {
            color: #007bff;
            font-size: 10px;
        }

        .progress-cell {
            text-align: center;
            font-weight: 600;
            color: #333;
        }

        .status-behind {
            color: #dc3545;
            font-weight: 600;
            font-size: 10px;
        }

        .status-ontrack {
            color: #ffa500;
            font-weight: 600;
            font-size: 10px;
        }
            .status-ahead {
            color: #28a745;
            font-weight: 600;
            font-size: 10px;
        }

        .punctuality-ontime {
            color: #28a745;
            font-weight: 600;
            font-size: 10px;
        }

        .punctuality-late {
            color: #dc3545;
            font-weight: 600;
            font-size: 10px;
        }

        .content {
            padding: 20px;
        }

        @media (max-width: 768px) {
            .container {
                margin: 10px;
            }

            .course-table {
                font-size: 9px;
            }

            .course-table th,
            .course-table td {
                padding: 6px 4px;
            }

            .main-title {
                font-size: 22px;
            }
        }
    </style>
</head>

<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <img src="https://res.cloudinary.com/drpejhhoq/image/upload/pwioi_logo_r4gxvy.png" alt="IOI Logo" style="width: 130px; height: 40px;">
            </div>
            <h1 class="main-title">Weekly Course Progress Report</h1>
            <p class="subtitle">Comprehensive Course Progress Analysis</p>
            <div class="report-date">Report of current semester till ${formattedDate}</div>
        </div>

        <div class="content">
            ${reportBody}
        </div>
        <div style="padding: 20px; text-align: center; border-top: 1px solid #ddd; margin-top: 30px;">
            <p style="font-size: 14px; color: #555; margin-bottom: 10px;">
                This report provides a snapshot of the current semester's course progress and punctuality across all divisions.  
                For more detailed insights, trends, and analytics, please visit the CPR Dashboard.
            </p>
            <a href="https://app.pwioi.club/dashboard/superadmin/dashboard/coursepr" 
               style="display: inline-block; margin-top: 10px; padding: 10px 18px; background: linear-gradient(135deg, #007bff, #0056b3); 
                      color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                View Full CPR Dashboard
            </a>
            <p style="font-size: 12px; color: #888; margin-top: 15px;">
                Thank you for your continued efforts in ensuring academic excellence.
            </p>
            <p style="font-size: 11px; color: #999; margin-top: 8px; font-style: italic;">
                This is an automated email. Please do not reply.
            </p>
        </div>
    </div>
</body>

</html>`;
}

function getSchoolBadgeClass(schoolName: string): string {
  switch (schoolName) {
    case 'SOT': return '';
    case 'SOM': return 'som';
    case 'SOH': return 'soh';
    default: return '';
  }
}

function getSchoolFullName(schoolName: string): string {
  switch (schoolName) {
    case 'SOT': return 'School of Technology';
    case 'SOM': return 'School of Management';
    case 'SOH': return 'School of Healthcare';
    default: return schoolName;
  }
}