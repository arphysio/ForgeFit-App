export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return Response.json({ error: 'Missing userId' }, { status: 400 });
  }

  return Response.json({
    provider: 'apple',
    connectableOnWeb: false,
    message:
      'Apple Health uses HealthKit and must be connected from the iOS patient app. Web cannot directly authorize HealthKit.',
    nextStep:
      'Open the iOS app -> Settings -> Apple Health -> Allow all requested data types. Then sync to ForgeFit backend.',
  });
}
