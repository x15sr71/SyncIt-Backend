import { clearYouTubePlaylist } from "../services/emptyPlaylist/emptyYoutubePlaylist";

export const emptyYouTubePlaylist = async (req, res) => {
  const userId = req.session?.id;
  // const { playlistId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "MISSING_PARAMS",
      message: "User session or playlistId missing.",
    });
  }

  try {
    const result = await clearYouTubePlaylist(
      userId,
      "PLY6KwKMkfULW2bGdfKhzHa8mEf9joJwXK"
    );
    return res.json(result);
  } catch (error) {
    const statusCode = error?.response?.status || 500;
    const isAuthError = statusCode === 401;
    const isRateLimit = statusCode === 429 || statusCode === 403;

    const errorCode = isAuthError
      ? "YT_AUTH_ERROR"
      : isRateLimit
      ? "YT_RATE_LIMITED"
      : "YT_CLEAR_FAILED";

    const errorMessage =
      error?.response?.data?.error?.message || error.message || "Unknown error";

    console.error("Error clearing YouTube playlist:", errorMessage);

    return res.status(statusCode).json({
      success: false,
      code: statusCode,
      error: errorCode,
      message: errorMessage,
    });
  }
};
