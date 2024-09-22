// Convert milliseconds to a formatted mm:ss string
export const convertDurationToFormattedString = (durationMs) => {
    const totalSeconds = Math.floor(durationMs / 1000); // Convert milliseconds to seconds
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`; // Format to mm:ss
};
