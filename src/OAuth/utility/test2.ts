import getUserPlaylists from "./getUserPlaylists";

export const test2 = async function (req, res) {
       await getUserPlaylists()
       res.json({
        done: "done"
       })
}