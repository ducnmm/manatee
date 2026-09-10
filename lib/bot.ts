export function botHandle(): string {
  return (process.env.X_BOT_HANDLE ?? 'ManateeWallet').replace(/^@/, '');
}

export function isBotMention(token: string): boolean {
  return token.toLowerCase() === `@${botHandle().toLowerCase()}`;
}
