// import { Prisma } from 'prisma';
// import { decrypt } from '../utility/util'; // Import your decryption functions

// const retrieveAccessToken = async () => {
//     const tokenRecord = await Prisma.spotifyToken.findFirst();
//     if (tokenRecord) {
//         const decryptedToken = decrypt(tokenRecord.token);
//         return decryptedToken;
//     }
//     throw new Error('No token found.');
// };
