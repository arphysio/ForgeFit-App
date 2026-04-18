import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req) {
  const { patient, session, exercises, priorPainAvg } = await req.json();

  const prompt = `Draft a clinical SOAP progress note for:
Patient: ${patient.name}, ${patient.condition}, Week ${patient.week}

Session data:
- Date: ${session.date}
- Duration: ${session.duration_min} min
- Overall pain: ${session.overall_pain}/10
- Overall RPE: ${session.overall_rpe}/20

Exercise log:
${exercises
  .map(
    (e) =>
      `${e.name}: ${e.sets_done}x${e.reps_done} @ ${e.weight}, pain ${e.pain_score}/10, RPE ${e.rpe_score}, notes: ${e.notes || 'none'}`
  )
  .join('\n')}

Prior session avg pain: ${priorPainAvg}/10

Return JSON:
{
  "S": "subjective: what patient reported",
  "O": "objective: measurable findings from session data",
  "A": "assessment: progress interpretation",
  "P": "plan: next steps and progressions"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
    system:
      'You are a physiotherapy clinical assistant. Write concise, professional SOAP notes based on session data. Always flag pain scores above 5/10 in the Assessment.',
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const soap = JSON.parse(text.replace(/```json|```/g, '').trim());

  return Response.json({ soap });
}
