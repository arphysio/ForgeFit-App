import { supabase } from './supabase';

const PAIN_THRESHOLD = 5; // Flag if any exercise pain >= 5/10
const RPE_THRESHOLD = 18; // Flag if overall RPE >= 18/20

export async function checkAndFlagSession(session) {
  const painFlags = session.exercises.filter((e) => e.pain_score >= PAIN_THRESHOLD);

  const rpeFlag = session.overall_rpe >= RPE_THRESHOLD;
  const overallPainFlag = session.overall_pain >= PAIN_THRESHOLD;

  if (painFlags.length === 0 && !rpeFlag && !overallPainFlag) return;

  // Build the flag message.
  const flagParts = [];
  if (overallPainFlag) {
    flagParts.push(`Overall pain reported: ${session.overall_pain}/10`);
  }
  if (rpeFlag) {
    flagParts.push(`High RPE reported: ${session.overall_rpe}/20`);
  }
  painFlags.forEach((e) => flagParts.push(`${e.name}: pain ${e.pain_score}/10`));

  // Insert alert message into the messages table.
  await supabase.from('messages').insert({
    sender_id: session.patient_id,
    recipient_id: session.clinician_id,
    patient_id: session.patient_id,
    body: `Auto-alert from session log:\n${flagParts.join('\n')}`,
    pain_flag: overallPainFlag || painFlags.length > 0,
    rpe_flag: rpeFlag,
    created_at: new Date().toISOString(),
  });

  // Send push notification to clinician (Expo).
  await sendPushToClinicianIfEnabled(session.clinician_id, {
    title: 'Pain flag - patient session',
    body: flagParts[0],
  });
}

async function sendPushToClinicianIfEnabled(clinicianId, notification) {
  void clinicianId;
  void notification;
  // Placeholder: integrate Expo push token lookup and dispatch here.
}
