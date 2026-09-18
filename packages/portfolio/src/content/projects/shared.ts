// ---------------------------------------------------------------------------
// Render helpers (used inside descriptions only).
// ---------------------------------------------------------------------------

export const toYouTubeVideoUrl = ({
  youTubeVideoId,
  autoplay = true,
  mute = true,
}: {
  youTubeVideoId: string;
  autoplay?: boolean;
  mute?: boolean;
}): string => {
  const params = new URLSearchParams();
  if (autoplay) params.append('autoplay', '1');
  if (mute) params.append('mute', '1');
  params.append('loop', '1');
  params.append('playlist', youTubeVideoId);
  return `https://www.youtube.com/embed/${youTubeVideoId}?${params.toString()}`;
};

export const htmlLink = (href: string, text: string): string =>
  `<a style="color: white;" target="_blank" rel="noreferrer noopener" href="${href}">${text}</a>`;

export const externalLink = (href: string, text: string): string =>
  htmlLink(
    href,
    `${text}<span style="font-size: 0.8em; padding-left: 0.3em; text-decoration: none; display: inline-block;">↗</span>`
  );

// ---------------------------------------------------------------------------
// Constants reused inside descriptions.
// ---------------------------------------------------------------------------

export const IMAGE_ALT = 'A screenshot of the project';
export const GAMEZILLA_HREF = 'https://www.gamezilla.app/';
export const LAMDERA_HREF = 'https://lamdera.com/';
