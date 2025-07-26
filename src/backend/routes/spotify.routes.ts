import express from "express";
import { searchSpotifyTracks } from "../controllers/spotify.controller";
import sessionMiddleware from "../../middlewares/sessionMiddleware";

const router = express.Router();

/**
 * @openapi
 * /spotifyTracks:
 *   get:
 *     tags:
 *       - Spotify
 *     summary: Search Spotify tracks
 *     description: Returns a list of Spotify tracks based on a query.
 *     parameters:
 *       - name: query
 *         in: query
 *         required: true
 *         description: Search query string
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of matching Spotify tracks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         description: Unauthorized or session expired
 */
router.get("/spotifyTracks", sessionMiddleware, searchSpotifyTracks);

export default router;
