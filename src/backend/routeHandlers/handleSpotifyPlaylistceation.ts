// import { Request, Response } from 'express';
// import { createSpotifyPlaylist } from '../playlistsCRUD/createSpotifyPlaylist';

// export async function handleCreatePlaylist(req: Request, res: Response) {
//     const { playlistName, userId, description, isPublic } = req.body;

//     if (!playlistName) {
//         return res.status(400).json({ error: "playlistName is required." });
//     } else if (typeof playlistName !== 'string') {
//         return res.status(400).json({ error: "playlistName must be a string." });
//     }

//     if (!userId) {
//         return res.status(400).json({ error: "userId is required." });
//     } else if (typeof userId !== 'string') {
//         return res.status(400).json({ error: "userId must be a string." });
//     }

//     if (description && typeof description !== 'string') {
//         return res.status(400).json({ error: "description must be a string." });
//     }

//     if (isPublic !== undefined && typeof isPublic !== 'boolean') {
//         return res.status(400).json({ error: "isPublic must be a boolean." });
//     }

//     try {
//         const playlist = await createSpotifyPlaylist({
//             playlistName,
//             userId,
//             description,
//             isPublic: isPublic ?? false
//         });

//         const filteredResponse = {
//             id: playlist.id,
//             name: playlist.name,
//             description: playlist.description
//         };

//         return res.status(201).json(filteredResponse);
        
//     } catch (error) {
//         console.error('Error creating playlist:', error);
//         return res.status(500).json({ error: "Failed to create playlist." });
//     }
// }
