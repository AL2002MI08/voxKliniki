/**
 * TwiML string builders — mirrors Hospvoice.Services.Twilio in Elixir.
 * Returns raw XML strings that Express sends back to Twilio.
 */

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twilioLangCode(lang) {
  return { rw: 'rw-RW', en: 'en-US' }[lang] ?? 'en-US';
}

function ttsVoice(lang) {
  return 'Polly.Joanna';
}

// ── TwiML builders ────────────────────────────────────────────────────────────

function consentRequest(language = 'en') {
  const greetings = {
    rw: 'Murakaza neza kuri serivisi ya Clinic. Iri tangazo rizakoreshwa gufasha inzobere z\'ubuzima baguha serivisi nziza. Ese wemeye? Sema Yego cyangwa Oya.',
    en: 'Welcome to the clinic intake system. This call will be recorded for quality and medical intake purposes. Do you agree? Say Yes or No.',
  };
  const greeting = greetings[language] ?? greetings.en;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/webhooks/voice/consent" method="POST" speechTimeout="5" language="${twilioLangCode(language)}">
    <Say voice="${ttsVoice(language)}">${escapeXml(greeting)}</Say>
  </Gather>
  <Redirect>/webhooks/voice/consent_timeout</Redirect>
</Response>`;
}

function languageSelection() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf speech" action="/webhooks/voice/language" method="POST" timeout="10" numDigits="1">
    <Say voice="Polly.Joanna">Please select your language. Press 1 for Kinyarwanda. Press 2 for English.</Say>
  </Gather>
  <Redirect>/webhooks/voice/language_timeout</Redirect>
</Response>`;
}

function languageTimeout() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We did not receive a language selection. Defaulting to English.</Say>
  <Redirect method="POST">/webhooks/voice/intake/start</Redirect>
</Response>`;
}

function sayAndGather(text, actionPath, language = 'en', speechTimeout = 'auto') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionPath}" method="POST" speechTimeout="${speechTimeout}" language="${twilioLangCode(language)}" speechModel="experimental_conversations">
    <Say voice="${ttsVoice(language)}">${escapeXml(text)}</Say>
  </Gather>
  <Redirect method="POST">${actionPath}?timeout=true</Redirect>
</Response>`;
}

function playAndGather(audioUrl, actionPath, language = 'en') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionPath}" method="POST" speechTimeout="auto" language="${twilioLangCode(language)}" speechModel="experimental_conversations">
    <Play>${escapeXml(audioUrl)}</Play>
  </Gather>
  <Redirect method="POST">${actionPath}?timeout=true</Redirect>
</Response>`;
}

function sayAndHangup(text, language = 'en') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${ttsVoice(language)}">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

function transferToOperator() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We are transferring you to a clinic operator. Please hold.</Say>
  <Dial>
    <Number>${process.env.OPERATOR_PHONE || process.env.TWILIO_PHONE_NUMBER || ''}</Number>
  </Dial>
  <Hangup/>
</Response>`;
}

module.exports = {
  consentRequest,
  languageSelection,
  languageTimeout,
  sayAndGather,
  playAndGather,
  sayAndHangup,
  transferToOperator,
};
