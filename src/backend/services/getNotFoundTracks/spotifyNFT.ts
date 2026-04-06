import prisma from "../../../db/prisma";

export const getNotFoundTracksFromSpotify = async (userId: string) => {
  try {
    const result = await prisma.spotifyData.findFirst({
      where: { userId },
      select: { retryToFindTracks: true },
    });

    const tracks = result?.retryToFindTracks ? JSON.parse(result.retryToFindTracks) : [];

    if (tracks.length === 0) {
      return {
        success: true,
        message: "No tracks are marked as not found. Nothing to retry.",
        data: [],
      };
    }

    return {
      success: true,
      data: tracks,
    };
  } catch (error) {
    console.error("Error fetching not found Spotify tracks:", error);

    return {
      success: false,
      error: "FETCH_FAILED",
      message: "Failed to retrieve not found tracks from Spotify data.",
    };
  }
};
