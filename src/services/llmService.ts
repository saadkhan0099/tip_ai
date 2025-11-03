export async function parseIntent(transcription: string) {
  const match = transcription.match(/send\s+(\d+)\s+USDC\s+to\s+@(\w+)/i);
  if (!match) {
    throw new Error("Could not parse intent");
  }
  const amount = parseInt(match[1], 10);
  const recipientUsername = "@" + match[2];
  const token = "USDC";
  return { amount, token, recipientUsername };
}
