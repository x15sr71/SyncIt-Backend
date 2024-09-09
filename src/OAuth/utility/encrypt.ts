import crypto from 'crypto'

export const  hashId = function (response) {
    // Collect all track IDs
    const trackIDs = response.data.items.map(item => item.track.id);

    // Create a hash of the array (you can use SHA-256, SHA-1, etc.)
    const hash = crypto.createHash('sha256')
                       .update(JSON.stringify(trackIDs))  // Hash the array as a JSON string
                       .digest('hex');                    // Convert to hexadecimal format

    return { hash };
}