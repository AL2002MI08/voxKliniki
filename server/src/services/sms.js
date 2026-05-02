const twilio = require('twilio');
const { groqChat } = require('./openai');

let twilioClient = null;

function getClient() {
  if (!twilioClient) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn('Twilio credentials not configured — SMS disabled');
      return null;
    }
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

async function sendSms(to, body) {
  const client = getClient();
  if (!client) return null;
  try {
    return await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
  } catch (err) {
    console.error('SMS send failed:', err.message);
    return null;
  }
}

async function sendYourTurn(patient, department, language = 'en') {
  if (!patient?.phone_number) return;
  const deptName = department?.name ?? 'clinic';

  if (language === 'rw') {
    const prompt = `Write a VERY SHORT SMS (max 60 characters) in Kinyarwanda telling the patient it's their turn at the clinic.

Clinic/Department: ${deptName}

Response:`;

    try {
      const body = await groqChat(
        [
          { role: 'system', content: 'Write very brief clinic notifications in Kinyarwanda only. Max 60 characters. No English, no Swahili.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, maxTokens: 30 }
      );
      await sendSms(patient.phone_number, body.trim());
      return;
    } catch (err) {
      console.error('Your turn SMS AI failed:', err.message);
    }
  }

  const body = `VoxKliniki: It's your turn at ${deptName}. Please proceed to the reception desk. Thank you.`;
  await sendSms(patient.phone_number, body);
}

async function generateSmsContent(language, queueNumber, estimatedWait, departmentName) {
  if (language === 'rw') {
    const prompt = `You are a clinic SMS assistant in Rwanda. Write a SHORT SMS (max 80 characters) to tell a patient their queue number.

Write ONLY the SMS message in Kinyarwanda. Keep it brief and friendly.

Queue number: ${queueNumber}
Department: ${departmentName}
Estimated wait: ${estimatedWait ? `~${estimatedWait} minutes` : 'not specified'}

Response:`;

    try {
      const result = await groqChat(
        [
          { role: 'system', content: 'You write brief, friendly clinic SMS notifications in Kinyarwanda only. No English, no Swahili. Max 80 characters.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, maxTokens: 50 }
      );
      return result.trim();
    } catch (err) {
      console.error('SMS AI failed, using fallback:', err.message);
    }
  }

  return language === 'rw'
    ? `VoxKliniki: Umubare ${queueNumber}.${estimatedWait ? ` Tegereza: ~${estimatedWait} dk.` : ''} Murakoze.`
    : `VoxKliniki: Queue #${queueNumber}.${estimatedWait ? ` Wait: ~${estimatedWait} min.` : ''} Please wait.`;
}

async function sendQueueConfirmation(patient, queueNumber, estimatedWait, nearbyHospitals = [], language = 'en') {
  if (!patient?.phone_number) return;

  const deptName = patient?.assigned_department?.name ?? 'clinic';
  const body = await generateSmsContent(language, queueNumber, estimatedWait, deptName);

  let additionalInfo = '';
  if (nearbyHospitals.length > 0 && language === 'en') {
    const list = nearbyHospitals.map((h) => h.name).join(', ');
    additionalInfo = ` Nearby: ${list}`;
  }

  await sendSms(patient.phone_number, body + additionalInfo);
}

module.exports = { sendSms, sendYourTurn, sendQueueConfirmation };
