import prisma from "../prismaClient";
import { get_SpotifyAccessToken } from "../tokenManagement/spotifyTokenUtil";
import { hashId } from "./encrypt";
import axios from "axios";
import { compareHash } from "./encrypt";

export const test = async (req, res) => {
    const accessToken = await get_SpotifyAccessToken();

    const response = await axios.get("https://api.spotify.com/v1/me/tracks", {
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        params: {
            limit: 50,
            offset: 0
        }
    });

    let currentTrackIDs = response.data.items.map(item => item.track.id);

    const currentHash = hashId(response);

    console.log(currentHash);

    const previousHashRecord = await prisma.spotifyData.findFirst({
        where: {
            username: "Chandragupt Singh"
        },
        select: {
            last_playlistTrackIds_hash: true,
        }
    });

    const isSame = compareHash(previousHashRecord.last_playlistTrackIds_hash, currentHash.hash);

    if (isSame) {
        console.log("THEY ARE SAME");
    } else {
        console.log("NOT THE SAME");

        const prevTrackIDs = await prisma.spotifyData.findFirst({
            where: {
                username: "Chandragupt Singh"
            },
            select: {
                last_TrackIds: true
            }
        });

        let previousTrackIds = JSON.parse(prevTrackIDs.last_TrackIds);

        const addedTracks = currentTrackIDs.filter(id => !previousTrackIds.includes(id));
        const removedTracks = previousTrackIds.filter(id => !currentTrackIDs.includes(id));

        console.log("Added Tracks:", addedTracks);
        console.log("Removed Tracks:", removedTracks);

        const trackDetails = response.data.items
            .filter(item => addedTracks.includes(item.track.id) || removedTracks.includes(item.track.id))
            .map(item => ({
                trackId: item.track.id,
                trackName: item.track.name,
                artists: item.track.artists.map(artist => artist.name).join(', '),
                albumName: item.track.album.name,
                albumType: item.track.album.album_type,
                releaseDate: item.track.album.release_date,
                durationMs: item.track.duration_ms
            }));

        const trackChanges = {
            removedTrackIds: removedTracks,
            addedTracks: trackDetails
        };

        console.log("Track Changes:", trackChanges);

        // Respond with trackChanges object
        res.json(trackChanges);
    }
};
