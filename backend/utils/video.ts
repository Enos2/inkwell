// Location: backend/utils/video.ts
// Purpose: Checks video links and turns them into safe "embed" links. Only
// YouTube and Vimeo links starting with https:// are accepted. We never host
// video ourselves, which keeps Inkwell free to run.

type ParsedVideo = {
  provider: "youtube" | "vimeo";
  id: string;
  embedUrl: string;
};

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];
const VIMEO_HOSTS = ["vimeo.com", "www.vimeo.com"];
const YOUTUBE_ID = /^[\w-]{11}$/;

function youtube(id: string): ParsedVideo {
  return {
    provider: "youtube",
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
  };
}

function vimeo(id: string): ParsedVideo {
  return {
    provider: "vimeo",
    id,
    embedUrl: `https://player.vimeo.com/video/${id}`,
  };
}

// Returns the video details, or null if the link is not an allowed video link.
export function parseVideoUrl(raw: string): ParsedVideo | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return YOUTUBE_ID.test(id) ? youtube(id) : null;
  }

  if (YOUTUBE_HOSTS.includes(host)) {
    let id: string | null = url.searchParams.get("v");
    if (
      url.pathname.startsWith("/embed/") ||
      url.pathname.startsWith("/shorts/")
    ) {
      id = url.pathname.split("/")[2] ?? null;
    }
    return id && YOUTUBE_ID.test(id) ? youtube(id) : null;
  }

  if (VIMEO_HOSTS.includes(host)) {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^\d+$/.test(id) ? vimeo(id) : null;
  }

  if (host === "player.vimeo.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[1] ?? "";
    return parts[0] === "video" && /^\d+$/.test(id) ? vimeo(id) : null;
  }

  return null;
}

// Location: backend/utils/video.ts
// End of file: video.ts