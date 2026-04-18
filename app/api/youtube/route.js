// app/api/youtube/route.js
// Server-side YouTube search — keeps the API key off the client.
// Usage: GET /api/youtube?q=bench+press

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q) {
    return Response.json({ error: 'Missing query param q' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  }

  try {
    const query = encodeURIComponent(`${q} exercise tutorial how to`);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=1&key=${apiKey}`,
      { next: { revalidate: 86400 } } // cache result for 24hrs to save quota
    );

    if (!res.ok) {
      const err = await res.json();
      return Response.json({ error: err?.error?.message || 'YouTube API error' }, { status: res.status });
    }

    const data = await res.json();
    const videoId = data?.items?.[0]?.id?.videoId ?? null;
    const title = data?.items?.[0]?.snippet?.title ?? null;

    return Response.json({ videoId, title });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
