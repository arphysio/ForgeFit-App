import { pushWorkoutToGarmin } from '../../../../lib/garmin';

export async function POST(req) {
  try {
    const { accessToken, workout } = await req.json();

    if (!accessToken || !workout) {
      return Response.json(
        { error: 'Missing required fields: accessToken and workout' },
        { status: 400 }
      );
    }

    const result = await pushWorkoutToGarmin(accessToken, workout);
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to push workout to Garmin' },
      { status: 500 }
    );
  }
}
