import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/client';

export const ACCESS_TOKEN_PREFIX = 'np_oauth_';
export const REFRESH_TOKEN_PREFIX = 'np_refresh_';
export const AUTH_CODE_PREFIX = 'np_code_';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d
const AUTH_CODE_TTL_SECONDS = 60 * 10; // 10min

export const SUPPORTED_SCOPES = ['mcp'] as const;
export const DEFAULT_SCOPE = 'mcp';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(prefix: string): string {
  return prefix + randomBytes(32).toString('base64url');
}

function timingSafeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// PKCE S256 verification per RFC 7636.
export function verifyPkceS256(codeVerifier: string, expectedChallenge: string): boolean {
  // BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return timingSafeStringEq(computed, expectedChallenge);
}

export interface RegisterClientInput {
  clientName?: string | null;
  redirectUris: string[];
  softwareId?: string | null;
  softwareVersion?: string | null;
  // Spec allows clients to ask for scopes; we ignore and pin to "mcp" for now.
}

export async function registerClient(input: RegisterClientInput) {
  // Light validation. RFC 7591 requires at least one redirect_uri for code grant.
  if (!input.redirectUris.length) {
    throw new InvalidClientMetadataError('redirect_uris is required');
  }
  for (const uri of input.redirectUris) {
    if (!isAcceptableRedirectUri(uri)) {
      throw new InvalidClientMetadataError(`redirect_uri rejected: ${uri}`);
    }
  }
  const clientId = 'np_client_' + randomBytes(16).toString('base64url');
  const created = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName: input.clientName ?? null,
      redirectUris: input.redirectUris,
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'none',
      softwareId: input.softwareId ?? null,
      softwareVersion: input.softwareVersion ?? null,
      scope: DEFAULT_SCOPE,
    },
  });
  return created;
}

// loopback (http://localhost, http://127.0.0.1) is allowed per RFC 8252; otherwise require https.
function isAcceptableRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return true;
  }
  // Custom URI schemes are also allowed for native clients (e.g. com.anthropic.claude://callback)
  // but require server policy. For now we accept any non-http(s) scheme that isn't javascript/data/file.
  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:' &&
    url.protocol !== 'javascript:' &&
    url.protocol !== 'data:' &&
    url.protocol !== 'file:'
  ) {
    return true;
  }
  return false;
}

export async function getClient(clientId: string) {
  return prisma.oAuthClient.findUnique({ where: { clientId } });
}

export interface IssueAuthCodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
}

export async function issueAuthCode(input: IssueAuthCodeInput) {
  const code = randomToken(AUTH_CODE_PREFIX);
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: sha256(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      scope: input.scope,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

export interface ConsumeAuthCodeInput {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface ConsumedAuthCode {
  userId: string;
  scope: string;
}

export async function consumeAuthCode(input: ConsumeAuthCodeInput): Promise<ConsumedAuthCode> {
  const codeHash = sha256(input.code);
  const row = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash } });
  if (!row) throw new InvalidGrantError('code not found');
  if (row.consumedAt) throw new InvalidGrantError('code already used');
  if (row.expiresAt.getTime() < Date.now()) throw new InvalidGrantError('code expired');
  if (row.clientId !== input.clientId) throw new InvalidGrantError('client mismatch');
  if (row.redirectUri !== input.redirectUri) throw new InvalidGrantError('redirect_uri mismatch');
  if (row.codeChallengeMethod !== 'S256') {
    throw new InvalidGrantError(`unsupported code_challenge_method: ${row.codeChallengeMethod}`);
  }
  if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) {
    throw new InvalidGrantError('PKCE verification failed');
  }
  await prisma.oAuthAuthorizationCode.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return { userId: row.userId, scope: row.scope };
}

export interface IssueAccessTokenInput {
  clientId: string;
  userId: string;
  scope: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export async function issueAccessToken(input: IssueAccessTokenInput): Promise<IssuedTokens> {
  const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = randomToken(REFRESH_TOKEN_PREFIX);
  const now = Date.now();
  await prisma.oAuthAccessToken.create({
    data: {
      tokenHash: sha256(accessToken),
      refreshTokenHash: sha256(refreshToken),
      clientId: input.clientId,
      userId: input.userId,
      scope: input.scope,
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return {
    accessToken,
    refreshToken,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export interface RefreshAccessTokenInput {
  refreshToken: string;
  clientId: string;
}

export async function refreshAccessToken(input: RefreshAccessTokenInput): Promise<IssuedTokens> {
  if (!input.refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
    throw new InvalidGrantError('refresh_token format invalid');
  }
  const oldHash = sha256(input.refreshToken);
  const row = await prisma.oAuthAccessToken.findUnique({
    where: { refreshTokenHash: oldHash },
  });
  if (!row) throw new InvalidGrantError('refresh_token not found');
  if (row.revokedAt) throw new InvalidGrantError('refresh_token revoked');
  if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() < Date.now()) {
    throw new InvalidGrantError('refresh_token expired');
  }
  if (row.clientId !== input.clientId) throw new InvalidGrantError('client mismatch');

  // Refresh-token rotation: revoke the old token row and issue a new one.
  await prisma.oAuthAccessToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });
  return issueAccessToken({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
  });
}

export interface VerifiedOAuthToken {
  user: { id: string; email: string; name: string | null; role: 'ADMIN' | 'SALES' };
  token: { id: string; clientId: string };
}

export async function verifyAccessToken(rawToken: string): Promise<VerifiedOAuthToken | null> {
  if (!rawToken.startsWith(ACCESS_TOKEN_PREFIX)) return null;
  const tokenHash = sha256(rawToken);
  const row = await prisma.oAuthAccessToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  // Best-effort touch — failures here shouldn't fail the request.
  prisma.oAuthAccessToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.user.role,
    },
    token: { id: row.id, clientId: row.clientId },
  };
}

// ---------- Errors mapped to OAuth error responses ----------

export class OAuthError extends Error {
  status: number;
  code: string; // e.g. invalid_grant, invalid_client, invalid_request, invalid_client_metadata
  description: string;
  constructor(status: number, code: string, description: string) {
    super(`${code}: ${description}`);
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

export class InvalidClientMetadataError extends OAuthError {
  constructor(description: string) {
    super(400, 'invalid_client_metadata', description);
  }
}
export class InvalidRequestError extends OAuthError {
  constructor(description: string) {
    super(400, 'invalid_request', description);
  }
}
export class InvalidGrantError extends OAuthError {
  constructor(description: string) {
    super(400, 'invalid_grant', description);
  }
}
export class InvalidClientError extends OAuthError {
  constructor(description: string) {
    super(401, 'invalid_client', description);
  }
}
export class UnsupportedGrantTypeError extends OAuthError {
  constructor(description: string) {
    super(400, 'unsupported_grant_type', description);
  }
}
