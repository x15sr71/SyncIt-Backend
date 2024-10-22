const { fetchSpotifyTracks, fetchYouTubeTracks, syncPlatforms } = require('./apiClients');

async function syncTracks() {
  try {
    // Fetch liked tracks from Spotify
    const spotifyTracks = await fetchSpotifyTracks();
    console.log('Fetched Spotify tracks:', spotifyTracks.length);

    // Fetch liked tracks from YouTube
    const youtubeTracks = await fetchYouTubeTracks();
    console.log('Fetched YouTube tracks:', youtubeTracks.length);

    // Sync Spotify and YouTube tracks
    const syncResult = await syncPlatforms(spotifyTracks, youtubeTracks);
    console.log('Sync result:', syncResult);

  } catch (error) {
    throw new Error(`Failed to sync tracks: ${error.message}`);
  }
}

module.exports = { syncTracks };
