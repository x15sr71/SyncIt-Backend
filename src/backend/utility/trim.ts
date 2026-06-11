function trimDescription(description: string, maxLength: number): string {
  if (description.length <= maxLength) {
    return description.replace(/\s{2,}/g, ' ');
  }

  const halfLength = Math.floor(maxLength / 2);
  const start = description.slice(0, halfLength).trim();
  const end = description.slice(-halfLength).trim();
  return `${start} ${end}`.replace(/\s{2,}/g, ' ');
}

export function trimTrackDescriptions(tracks: any[], maxLength: number) {
  return tracks.map((track: any) => ({
    trackNumber: track.trackNumber,
    title: track.title,
    description: trimDescription(track.description, maxLength),
    videoChannelTitle: track.videoChannelTitle,
    duration: track.duration,
    publishedDate: track.publishedDate,
    trackId: track.trackId,
    channelName: track.videoChannelTitle,
  }));
}
