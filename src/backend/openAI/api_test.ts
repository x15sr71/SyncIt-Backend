import trimmedTrackArray from "../../OAuth/utility/trim"

export const test = function (req, res) {
    console.log(trimmedTrackArray)
    res.json({
        done: "done"
    })    
}