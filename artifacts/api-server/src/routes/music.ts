import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/music/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!query) {
    return res.status(400).json({ error: "Enter a song, artist, or music style to search." });
  }
  if (!apiKey) {
    return res.status(503).json({ error: "Music search is temporarily unavailable." });
  }

  try {
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoCategoryId: "10",
      maxResults: "12",
      safeSearch: "moderate",
      q: query,
      key: apiKey,
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!response.ok) {
      return res.status(502).json({ error: "Music search is temporarily unavailable." });
    }
    const payload = await response.json() as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
      }>;
    };
    const results = (payload.items ?? [])
      .map((item) => ({
        videoId: item.id?.videoId ?? "",
        title: item.snippet?.title ?? "Untitled track",
        channel: item.snippet?.channelTitle ?? "YouTube",
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
      }))
      .filter((item) => item.videoId);
    return res.json({ results });
  } catch {
    return res.status(502).json({ error: "Music search is temporarily unavailable." });
  }
});

export default router;