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
        division: { select: { code: true, school: { select: { name: true } } } },
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
      lectureHtml += `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
          <h3 style="margin-top:0; margin-bottom: 10px; color: #333;">
            Class: ${item.classInfo.subject.name} (${item.classInfo.division.school.name} ${item.classInfo.division.code})
          </h3>
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
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Hi ${teacherName},</h2>
        <p>This is a friendly reminder to please update the status for any pending CPR sub-topics from your classes today.</p>
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