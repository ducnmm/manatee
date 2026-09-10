const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const ME_URL = 'https://api.twitter.com/2/users/me';

export type XAuthUser = {
  id: string;
  username: string;
  name: string;
};

export function xLoginEnabled(): boolean {
  return Boolean(process.env.TWITTER_OAUTH2_CLIENT_ID && process.env.TWITTER_OAUTH2_CLIENT_SECRET);
}

export function xOAuthPublicConfig(): { enabled: boolean; clientId: string; redirectUri: string } {
  return {
    enabled: xLoginEnabled(),
    clientId: process.env.TWITTER_OAUTH2_CLIENT_ID ?? '',
    redirectUri: process.env.TWITTER_OAUTH2_REDIRECT_URI ?? '',
  };
}

export async function exchangeXCode(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<XAuthUser> {
  const clientId = process.env.TWITTER_OAUTH2_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITTER_OAUTH2_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('X login is not configured');
  }
  const expected = process.env.TWITTER_OAUTH2_REDIRECT_URI?.trim();
  if (expected && args.redirectUri !== expected) {
    throw new Error('redirect_uri mismatch');
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.codeVerifier,
    }),
  });
  const tokenRaw = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`X token failed (${tokenRes.status})`);
  }
  const token = JSON.parse(tokenRaw) as { access_token?: string };
  if (!token.access_token) {
    throw new Error('X token missing');
  }
  const meRes = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const meRaw = await meRes.text();
  if (!meRes.ok) {
    throw new Error(`X user failed (${meRes.status})`);
  }
  const me = JSON.parse(meRaw) as { data?: XAuthUser };
  if (!me.data?.id || !me.data.username) {
    throw new Error('X user missing');
  }
  return me.data;
}
