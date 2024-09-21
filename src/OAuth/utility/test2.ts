import getUserPlaylists from "./getUserPlaylists";
import { queryDataForYoutube } from "./preProcessOpenAi";

export const test2 = async function (req, res) {

      queryDataForYoutube()
       res.json({
        done: "done"
       })
}