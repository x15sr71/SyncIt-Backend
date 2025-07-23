import axios, { AxiosError } from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../src/auth/youtube/youtubeTokensUtil";
import { addToYoutubePlaylist } from "../src/backend/services/addTo/addToYoutube";
import { describe, it, expect, jest } from "@jest/globals";

// Mocks
jest.mock("axios");
jest.mock("../src/auth/youtube/youtubeTokensUtil");

// Helper for typing the mocks
const getMockFunction = <T extends (...args: any[]) => any>(
  fn: T
): jest.MockedFunction<T> => fn as jest.MockedFunction<T>;

const mockedAxios = {
  get: getMockFunction(axios.get),
  post: getMockFunction(axios.post),
};
const mockedGetToken = getMockFunction(get_YoutubeAccessToken);
const mockedRefreshToken = getMockFunction(refreshYoutubeAccessToken);

describe("addToYoutubePlaylist", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds all new video IDs with no errors", async () => {
    mockedGetToken.mockResolvedValue("token");
    mockedAxios.get.mockResolvedValueOnce({
      data: { items: [], nextPageToken: undefined },
    });
    mockedAxios.post.mockResolvedValue({ status: 200 });
    const added = await addToYoutubePlaylist(
      "user1",
      ["v1", "v2"],
      "playlist1"
    );
    expect(added).toEqual(["v1", "v2"]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it("skips already existing videos", async () => {
    mockedGetToken.mockResolvedValue("token");
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        items: [{ contentDetails: { videoId: "v1" } }],
        nextPageToken: undefined,
      },
    });
    mockedAxios.post.mockResolvedValue({ status: 200 });
    const added = await addToYoutubePlaylist(
      "user1",
      ["v1", "v2"],
      "playlist1"
    );
    expect(added).toEqual(["v2"]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(
      (mockedAxios.post.mock.calls[0][1] as { snippet: { resourceId: { videoId: string } } }).snippet.resourceId.videoId
    ).toBe("v2");
  });

  it("returns empty array if all videos already exist", async () => {
    mockedGetToken.mockResolvedValue("token");
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        items: [
          { contentDetails: { videoId: "v1" } },
          { contentDetails: { videoId: "v2" } },
        ],
        nextPageToken: undefined,
      },
    });
    const added = await addToYoutubePlaylist(
      "user1",
      ["v1", "v2"],
      "playlist1"
    );
    expect(added).toEqual([]);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("only returns successfully added videos if some fail", async () => {
    mockedGetToken.mockResolvedValue("token");
    mockedAxios.get.mockResolvedValueOnce({
      data: { items: [], nextPageToken: undefined },
    });
    // First video succeeds, second fails
    mockedAxios.post
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce(new Error("fail"));
    const added = await addToYoutubePlaylist(
      "user1",
      ["v1", "v2"],
      "playlist1"
    );
    expect(added).toEqual(["v1"]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it("retries on 401, refreshes token, then succeeds", async () => {
    mockedGetToken
      .mockResolvedValueOnce("badtoken")
      .mockResolvedValueOnce("goodtoken");

    // Fake error object, must have .response.status = 401
    const err401 = { response: { status: 401 }, message: "Unauthorized" };
    mockedAxios.get
      .mockRejectedValueOnce(err401)
      .mockResolvedValueOnce({
        data: { items: [], nextPageToken: undefined },
      });
    mockedRefreshToken.mockResolvedValue({
      success: true,
      newAccessToken: "refreshtoken",
    });
    mockedAxios.post.mockResolvedValue({ status: 200 });

    const added = await addToYoutubePlaylist("user1", ["v1"], "playlist1");
    expect(added).toEqual(["v1"]);
    expect(mockedRefreshToken).toHaveBeenCalled();
    expect(mockedGetToken).toHaveBeenCalledTimes(2);
  });

  it("throws error after exceeding maximum retries", async () => {
    mockedGetToken.mockResolvedValue("badtoken");
    // Always 401 error object, with .response.status = 401
    const err401 = { response: { status: 401 }, message: "Unauthorized" };
    mockedAxios.get.mockRejectedValue(err401);
    mockedRefreshToken.mockResolvedValue({
      success: true,
      newAccessToken: "refreshtoken",
    });

    await expect(
      addToYoutubePlaylist("user1", ["v1"], "playlist1")
    ).rejects.toThrow(/exceeded max retries/i);

    expect(mockedRefreshToken).toHaveBeenCalledTimes(5);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
