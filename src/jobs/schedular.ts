import cron from 'node-cron';
import { sendCprReminders } from './cprReminder.job.js';
import { sendAdminWeeklyCprReport } from './adminCpr.job.js';

console.log("Scheduler is initializing...");

cron.schedule('0 17 * * *', async () => {
    console.log('-------------------------------------');
    console.log('Triggering the daily CPR reminder job (5:00 PM IST)...');
    try {
        await sendCprReminders();
    } catch (error) {
        console.error('A critical error occurred during the CPR reminder job:', error);
    }
    console.log('-------------------------------------');
}, {
    timezone: "Asia/Kolkata"
});

cron.schedule('0 19 * * 5', async () => {
    console.log('=====================================');
    console.log('Triggering the Admin Weekly CPR Report job (Friday 7:00 PM IST)...');
    try {
        await sendAdminWeeklyCprReport();
    } catch (error) {
        console.error('A critical error occurred during the Admin Report job:', error);
    }
    console.log('=====================================');
}, {
    timezone: "Asia/Kolkata"
});

console.log("✅ All cron jobs scheduled successfully.");