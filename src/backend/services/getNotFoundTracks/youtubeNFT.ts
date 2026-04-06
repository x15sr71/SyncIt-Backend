import prisma from "../../../db/prisma";

export const getNotFoundTracksFromYoutube = async (userId: string) => {
  try {
    const result = await prisma.youTubeData.findFirst({
      where: { userId },
      select: { retryToFindTracks: true },
    });

    console.log("YouTube Not Found Tracks Result:", result);

    const tracks = result?.retryToFindTracks || [];

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
    console.error("Error fetching not found YouTube tracks:", error);

    return {
      success: false,
      error: "FETCH_FAILED",
      message: "Failed to retrieve not found tracks from YouTube data.",
    };
  }
};
