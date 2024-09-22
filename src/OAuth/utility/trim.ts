// Function to trim the description from the middle and ensure no more than one space between words
function trimDescription(description, maxLength) {
    if (description.length <= maxLength) {
        return description.replace(/\s{2,}/g, ' ');
    }

    const halfLength = Math.floor(maxLength / 2);
    const start = description.slice(0, halfLength).trim();
    const end = description.slice(-halfLength).trim();

    // Combine and remove any extra spaces between words
    const combined = `${start} ${end}`.replace(/\s{2,}/g, ' ');
    return combined;
}

// Function to process and trim descriptions in an array of track objects
export function trimTrackDescriptions(tracks, maxLength) {
    return tracks.map(track => {
        const trimmedDescription = trimDescription(track.description, maxLength);
        return {
            trackNumber: track.trackNumber,
            title: track.title,
            description: trimmedDescription,
            videoChannelTitle: track.videoChannelTitle
        };
    });
}

