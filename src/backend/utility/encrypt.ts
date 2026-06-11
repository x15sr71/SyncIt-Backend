import crypto from 'crypto';

export const hashId = function (response: any): { hash: string } {
  const trackIDs = response.data.items.map((item: any) => item.track.id);

  // Create a hash of the array (you can use SHA-256, SHA-1, etc.)
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(trackIDs)) // Hash the array as a JSON string
    .digest('hex'); // Convert to hexadecimal format

  return { hash };
};

export const compareHash = function (previoushash: string, currenthash: string): boolean {
  if (previoushash != currenthash) {
    return false;
  }
  return true;
};
