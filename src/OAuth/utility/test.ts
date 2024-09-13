    import prisma from "../prismaClient"
    import { get_SpotifyAccessToken } from "../tokenManagement/spotifyTokenUtil";
    import { hashId } from "./encrypt"
    import axios from "axios";
    import { compareHash } from "./encrypt";

    export const test = async (req, res) => {

        const accessToken = await get_SpotifyAccessToken()

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

        const currenthash = hashId(response)

        console.log(currenthash)

        const previoushash = await prisma.spotifyData.findFirst({
            where: {
            username: "Chandragupt Singh"
            },
            select: {
            last_playlistTrackIds_hash: true,
            }
        })
      
          const isSame = compareHash(previoushash.last_playlistTrackIds_hash, currenthash.hash);
      
          if (isSame) {
            console.log("THEY ARE SAME");
          } else {
            console.log("NOT THE SAME");
          }

          if(!isSame) {
            const prevTrackIDs = await prisma.spotifyData.findFirst({
              where: {
                username: "Chandragupt Singh"
              },
              select: {
                last_TrackIds: true
              }          
            })

            let previousTrackId = JSON.parse(prevTrackIDs.last_TrackIds);

            //console.log("Current TrackId: ", currentTrackIDs )
            //console.log("Previous TrackId: ", prevTrackIDs.last_Tracks)

            const addedTracks = currentTrackIDs.filter(id => !previousTrackId.includes(id));
            
            const removedTracks = previousTrackId.filter(id => !currentTrackIDs.includes(id));
            
            console.log("Added Tracks:", addedTracks)
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

// Now trackDetails contains the track information for both added and removed tracks
console.log(trackDetails);
        
          }

        res.json({
            done: "done"
        })
    }