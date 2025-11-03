import usernameMap from "../utils/usernameMap";

type Env = {
  CIRCLE_API_KEY: string;
  CIRCLE_WALLET_ID: string;
};

export async function sendTip(
  amount: number,
  token: string,
  recipientUsername: string,
  env: Env
) {
  const address = usernameMap[recipientUsername];
  if (!address) {
    return { success: false, error: "Recipient not found" };
  }

  // TODO: Replace this with actual Arc/Circle API call using env.CIRCLE_API_KEY
  console.log(
    "Sending tip:",
    amount,
    token,
    "to",
    recipientUsername,
    "at",
    address
  );
  return { success: true, error: null };
}
