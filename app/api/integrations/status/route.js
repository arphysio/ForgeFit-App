import { listDeviceStatuses } from '@/lib/deviceTokens';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return Response.json({ error: 'Missing userId' }, { status: 400 });
    }

    const statuses = await listDeviceStatuses(userId);
    const strava = statuses.strava || { connected: false, updatedAt: null, expiresAt: null };
    return Response.json({
      userId,
      providers: {
        garmin: statuses.garmin || { connected: false, updatedAt: null, expiresAt: null },
        fitbit: statuses.fitbit || { connected: false, updatedAt: null, expiresAt: null },
        apple: statuses.apple || { connected: false, updatedAt: null, expiresAt: null },
        whoop: statuses.whoop || { connected: false, updatedAt: null, expiresAt: null },
        strava,
      },
      zwift: {
        oauthAvailable: false,
        stravaConnected: Boolean(strava.connected),
        virtualTypesMatchedOnStravaSync: ['VirtualRide', 'VirtualRun'],
        patientFitImportPath: '/calendar',
        note:
          'Zwift has no general third-party OAuth. Connect Strava in Zwift, connect Strava in ForgeFit, then use calendar “Sync from Strava” or import a downloaded activity .fit on My schedule.',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to fetch integration status' },
      { status: 500 }
    );
  }
}
