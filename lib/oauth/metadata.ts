// Resolve the public origin (scheme://host) for absolute URLs in OAuth metadata.
// In production this is the Railway deploy URL; in dev it's localhost. We let the
// PRICER_APP_URL env var override and otherwise reconstruct from the incoming Request.
export function resolvePublicOrigin(request: Request): string {
  const fromEnv = process.env.PRICER_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const url = new URL(request.url);
  // Strip any path/query — origin only.
  return `${url.protocol}//${url.host}`;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_documentation?: string;
}

export function buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/docs/mcp`,
  };
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

export function buildAuthorizationServerMetadata(origin: string): AuthorizationServerMetadata {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: ['mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}
