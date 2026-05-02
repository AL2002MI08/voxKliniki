const OpenAI = require('openai');

const apiKey = process.env.LOCALAI_API_KEY || 'localai';
const baseURL = process.env.LOCALAI_BASE_URL;

const client = new OpenAI(
  baseURL
    ? { apiKey, baseURL }
    : { apiKey }
);

const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL })
  : null;

const SYSTEM_PROMPT = `You are a voice medical intake assistant at a clinic in Rwanda. This is a PHONE CALL — keep every reply under 20 words. Ask ONE question at a time.

LANGUAGE RULE: Always reply in the exact language the patient uses. Kinyarwanda → Kinyarwanda only. English → English only.

STEPS:
1. Ask the patient's full name.
2. Ask which district or area they are calling from.
3. Ask their main health complaint.
4. Ask 2-3 short follow-up questions (severity, duration, other symptoms).
5. Detect red flags: chest pain, difficulty breathing, stroke signs, severe bleeding, unconsciousness, poisoning.
6. After 5-7 exchanges output the JSON below and nothing else.

URGENCY: critical (red flag present) | high (acute, <30 min) | medium (ongoing) | low (routine)
DEPARTMENTS: Emergency, Cardiology, Pediatrics, OB/GYN, Internal Medicine, Orthopedics, Neurology, ENT, Dermatology

When done, output EXACTLY:
<INTAKE_COMPLETE>
{"patient_name":"","patient_location":"","chief_complaint":"","symptoms":[],"red_flag_detected":false,"red_flag_details":null,"urgency_tier":"medium","recommended_department":"Internal Medicine","secondary_departments":[],"agent_summary":""}
</INTAKE_COMPLETE>`;

/**
 * Send a conversation to the OpenAI chat completions endpoint.
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ model?: string, temperature?: number }} opts
 * @returns {Promise<string>}
 */
async function chat(messages, opts = {}) {
  const response = await client.chat.completions.create(
    {
      model: opts.model ?? process.env.LOCALAI_CHAT_MODEL ?? 'gpt-4o-mini',
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 80,
      top_p: 0.9,
    },
    { timeout: opts.timeout ?? 30000 }
  );
  return response.choices[0].message.content ?? '';
}

/**
 * Build the initial system message for a patient intake session.
 */
function buildIntakeSystemPrompt(chronicConditions = [], visitHistory = []) {
  let prompt = SYSTEM_PROMPT;
  if (chronicConditions.length) {
    prompt += `\n\nPatient chronic conditions: ${chronicConditions.join(', ')}`;
  }
  if (visitHistory.length) {
    const recent = visitHistory
      .slice(0, 3)
      .map((v) => `${v.chief_complaint || 'unknown'} (${v.urgency_tier})`)
      .join('; ');
    prompt += `\nRecent visits: ${recent}`;
  }
  return prompt;
}

/**
 * Parse <INTAKE_COMPLETE>{...}</INTAKE_COMPLETE> from an assistant response.
 * Returns null if not present.
 */
function parseIntakeResult(text) {
  const match = text.match(/<INTAKE_COMPLETE>([\s\S]*?)<\/INTAKE_COMPLETE>/);
  if (!match) return null;
  try {
    const result = JSON.parse(match[1].trim());
    return result;
  } catch {
    return null;
  }
}

/**
 * Generate a clinical summary for a queue entry.
 */
async function clinicalSummary(entryData) {
  const { patient, call, urgency_tier, department } = entryData;
  const chronic = patient?.chronic_conditions ?? [];

  const prompt = `You are a clinical assistant helping clinic staff in East Africa.
Generate a concise handoff note.

Patient: ${patient?.name ?? patient?.phone_number ?? 'Unknown'}
Chronic conditions: ${chronic.length ? chronic.join(', ') : 'None'}
Chief complaint: ${call?.chief_complaint ?? 'Not recorded'}
Symptoms: ${call?.symptoms?.length ? call.symptoms.join(', ') : 'None listed'}
Red flag detected: ${call?.red_flag_detected ?? false}
Red flag details: ${call?.red_flag_details ?? 'None'}
Current urgency tier: ${urgency_tier}
Department assigned: ${department?.name ?? 'Unknown'}
Agent summary: ${call?.agent_summary ?? 'None'}

Return ONLY valid JSON:
{"assessment":"...","plan":"...","flags":"... or null"}`;

  const content = await chat(
    [
      { role: 'system', content: 'You are a clinical assistant. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { model: process.env.LOCALAI_CHAT_MODEL ?? 'gpt-4o-mini', temperature: 0.2 }
  );

  try {
    return JSON.parse(content.trim());
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Could not parse clinical summary response');
  }
}

async function groqChat(messages, opts = {}) {
  if (!groqClient) throw new Error('GROQ_API_KEY not configured');
  const response = await groqClient.chat.completions.create(
    {
      model: opts.model ?? process.env.GROQ_CHAT_MODEL ?? 'llama-3.3-70b-versatile',
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 80,
    },
    { timeout: opts.timeout ?? 15000 }
  );
  return response.choices[0].message.content ?? '';
}

module.exports = { client, chat, groqChat, buildIntakeSystemPrompt, parseIntakeResult, clinicalSummary };
