const JANE_BASE = 'https://api.janeapp.com/api/v1';

const headers = {
  Authorization: `Bearer ${process.env.JANE_API_KEY}`,
  'Content-Type': 'application/json',
};

// Pull a patient profile from Jane by their Jane ID.
export async function getJanePatient(janePatientId) {
  const res = await fetch(`${JANE_BASE}/patients/${janePatientId}`, { headers });
  return res.json();
}

// Pull upcoming appointments for a patient.
export async function getPatientAppointments(janePatientId) {
  const res = await fetch(
    `${JANE_BASE}/patients/${janePatientId}/appointments?status=upcoming`,
    { headers }
  );
  return res.json();
}

// Push a rehab program to the patient's Jane chart as a note.
export async function pushProgramToJane(janePatientId, program) {
  const noteBody = formatProgramAsNote(program);
  const res = await fetch(`${JANE_BASE}/patients/${janePatientId}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      note: {
        body: noteBody,
        note_type: 'exercise_program',
        title: program.title,
      },
    }),
  });
  return res.json();
}

// Push an AI-drafted SOAP note to Jane.
export async function pushSoapNoteToJane(janePatientId, soap) {
  const body = `S: ${soap.S}\n\nO: ${soap.O}\n\nA: ${soap.A}\n\nP: ${soap.P}`;
  const res = await fetch(`${JANE_BASE}/patients/${janePatientId}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ note: { body, note_type: 'progress_note' } }),
  });
  return res.json();
}

function formatProgramAsNote(program) {
  const lines = [
    `ForgeFit Program: ${program.title}`,
    `Phase: ${program.phase}`,
    '',
    'Exercises:',
    ...program.exercises.map(
      (e) => `- ${e.name}: ${e.sets} x ${e.reps} | ${e.notes || ''}`
    ),
  ];

  return lines.join('\n');
}
