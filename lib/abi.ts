export const LOCK_ABI = [
  'event TokensSentForBridging(address indexed from, address indexed to, address indexed token, uint256 amount)',
  'function send(address token, address to, uint256 amount)',
  'function allowed(address) view returns (bool)',
] as const;

export const TOKEN_ABI = [
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function mint(address,uint256)',
] as const;

export const MINT_ABI = [
  'function execute(uint8 action, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) returns (bool)',
  'function processedQueries(bytes32) view returns (bool)',
  'event TokensMinted(address indexed token, address indexed to, uint256 amount, bytes32 indexed queryId)',
] as const;
