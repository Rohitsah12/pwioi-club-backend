import { prisma } from "../db/prisma.js";
import { sendEmail } from "../service/email.service.js";

export async function sendCprReminders() {
  console.log("Starting CPR reminder job...");

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const teachersWithClassesToday = await prisma.teacher.findMany({
    where: {
      classes: {
        some: {
          start_date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      },
    },
    select: { id: true, name: true, email: true },
  });

  console.log(`Found ${teachersWithClassesToday.length} teachers with classes today.`);

  for (const teacher of teachersWithClassesToday) {
    const classesToday = await prisma.class.findMany({
      where: {
        teacher_id: teacher.id,
        start_date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        lecture_number: true,
        subject: { select: { id: true, name: true } },
        division: {
          select: {
            code: true,
            school: { select: { name: true } },
            batch: { select: { name: true } },
            center: { select: { code: true } },
          },
        },
      },
      orderBy: { start_date: 'asc' },
    });

    const allSubTopicsForDay: any[] = [];
    for (const cls of classesToday) {
      const subTopics = await prisma.cprSubTopic.findMany({
        where: {
          lecture_number: parseInt(cls.lecture_number),
          topic: {
            module: {
              subject_id: cls.subject.id,
            },
          },
        },
        select: { name: true, status: true },
      });

      if (subTopics.length > 0) {
        allSubTopicsForDay.push({ classInfo: cls, subTopics });
      }
    }

    if (allSubTopicsForDay.length === 0) continue;

    const pendingSubTopics = allSubTopicsForDay
      .flatMap(item => item.subTopics)
      .filter(st => st.status !== 'COMPLETED');

    if (pendingSubTopics.length > 0) {
      console.log(`Teacher ${teacher.name} has ${pendingSubTopics.length} pending CPRs. Sending email.`);
      const emailHtml = buildEmailHtml(teacher.name, allSubTopicsForDay);
      await sendEmail({
        to: teacher.email,
        subject: `CPR Reminder: Please update status for today's classes (${new Date().toLocaleDateString()})`,
        htmlBody: emailHtml,
      });
    }
  }
  console.log("CPR reminder job finished.");
}

function buildEmailHtml(teacherName: string, data: any[]): string {
  let lectureHtml = "";
  let markedCount = 0;
  let pendingCount = 0;

  for (const item of data) {
    // MODIFICATION: Destructuring more details to build the identifier
    const classInfo = item.classInfo;
    const subjectName = classInfo.subject.name;
    const centerCode = classInfo.division.center.code;
    const schoolName = classInfo.division.school.name;
    const batchName = classInfo.division.batch.name;
    const divisionCode = classInfo.division.code;

    // Construct the detailed class identifier as requested
    const classIdentifier = `${subjectName} (${centerCode}${schoolName}${batchName}${divisionCode})`;

    lectureHtml += `
      <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
        <h3 style="margin-top:0; margin-bottom: 10px; color: #333;">
          Class: ${classIdentifier}
        </h3>
        <strong>Lecture ${classInfo.lecture_number}:</strong>
        <ul style="list-style-type: none; padding-left: 15px; margin-top: 5px;">
    `;
    item.subTopics.forEach((st: any) => {
      const isCompleted = st.status === 'COMPLETED';
      let icon = '🟡'; // Default for PENDING or IN_PROGRESS
      if (isCompleted) {
        icon = '✅';
      }
      lectureHtml += `<li style="margin-bottom: 5px;">${icon} ${st.name} - <strong>Status: ${st.status}</strong></li>`;
      isCompleted ? markedCount++ : pendingCount++;
    });
    lectureHtml += `</ul></div>`;
  }

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ccc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #0056b3;">Hi ${teacherName},</h2>
      <p>This is a friendly reminder to please update the status for any pending CPR sub-topics from your classes today, <strong>${new Date().toDateString()}</strong>.</p>
      <hr style="border: 0; border-top: 1px solid #eee;">
      ${lectureHtml}
      <hr style="border: 0; border-top: 1px solid #eee;">
      <div style="padding: 15px; background-color: #e7f3fe; border-radius: 8px;">
        <h3 style="margin-top:0;">Summary for Today:</h3>
        <p style="margin-bottom: 0;">
          <strong>Total CPRs Marked as Completed:</strong> ${markedCount}<br>
          <strong>Total CPRs Pending/In-Progress:</strong> ${pendingCount}
        </p>
      </div>
      <p style="margin-top: 20px;">Thank you for keeping your course progress up-to-date!</p>
      <p style="font-size: 0.9em; color: #777;"><em>This is an automated reminder.</em></p>
    </div>
  `;
}