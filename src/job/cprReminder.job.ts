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
    select: {
      id: true,
      name: true,
      email: true,
    },
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
        subject: { select: { name: true } },
        division: { select: { code: true, school: { select: { name: true } } } },
      },
      orderBy: { start_date: 'asc' },
    });

    let allSubTopicsForDay: any[] = [];
    for (const cls of classesToday) {
        const subTopics = await prisma.cprSubTopic.findMany({
            where: { lecture_number: parseInt(cls.lecture_number) },
            select: { name: true, status: true },
        });
        
        allSubTopicsForDay.push({ classInfo: cls, subTopics });
    }

    const pendingSubTopics = allSubTopicsForDay.flatMap(item => item.subTopics).filter(st => st.status !== 'COMPLETED');

    if (pendingSubTopics.length > 0) {
      const emailHtml = buildEmailHtml(teacher.name, allSubTopicsForDay);
      await sendEmail({
        to: teacher.email,
        subject: `CPR Reminder: Please update your status for today's classes (${today.toLocaleDateString()})`,
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
    lectureHtml += `
      <div style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 5px;">Class: ${item.classInfo.subject.name} (${item.classInfo.division.school.name} ${item.classInfo.division.code})</h3>
        <strong>Lecture ${item.classInfo.lecture_number}:</strong>
        <ul style="list-style-type: none; padding-left: 15px; margin-top: 5px;">
    `;
    item.subTopics.forEach((st: any) => {
      const isCompleted = st.status === 'COMPLETED';
      lectureHtml += `<li>${isCompleted ? '✅' : '🟡'} ${st.name} - <strong>Status: ${st.status}</strong></li>`;
      isCompleted ? markedCount++ : pendingCount++;
    });
    lectureHtml += `</ul></div>`;
  }

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Hi ${teacherName},</h2>
      <p>Here's a summary of your classes from today. Please take a moment to update the status for any pending CPR sub-topics.</p>
      <hr>
      ${lectureHtml}
      <hr>
      <h3>Summary for Today:</h3>
      <p>
        <strong>Total CPRs Marked:</strong> ${markedCount}<br>
        <strong>Total CPRs Pending:</strong> ${pendingCount}
      </p>
      <p>Thank you for keeping your course progress up-to-date!</p>
    </div>
  `;
}
