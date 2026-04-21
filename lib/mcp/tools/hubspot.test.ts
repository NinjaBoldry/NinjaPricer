import { describe, it, expect } from 'vitest';
import {
  publishCatalogTool,
  pullHubSpotChangesTool,
  resolveReviewQueueItemTool,
  hubspotIntegrationStatusTool,
  hubspotCatalogTools,
} from './hubspot';
import type { McpContext } from '../context';

const adminCtx: McpContext = {
  user: { id: 'u-admin', role: 'ADMIN', email: 'a@x', name: null },
  token: { id: 't', ownerUserId: 'u-admin', label: 'admin-token' },
};

describe('hubspot MCP tools', () => {
  it('publishCatalogTool requires admin', () => {
    expect(publishCatalogTool.requiresAdmin).toBe(true);
    expect(publishCatalogTool.isWrite).toBe(true);
  });

  it('publishCatalogTool has correct name', () => {
    expect(publishCatalogTool.name).toBe('publish_catalog_to_hubspot');
  });

  it('pullHubSpotChangesTool requires admin and is a write', () => {
    expect(pullHubSpotChangesTool.requiresAdmin).toBe(true);
    expect(pullHubSpotChangesTool.isWrite).toBe(true);
  });

  it('pullHubSpotChangesTool has correct name', () => {
    expect(pullHubSpotChangesTool.name).toBe('pull_hubspot_changes');
  });

  it('resolveReviewQueueItemTool requires admin and validates resolution enum', () => {
    expect(resolveReviewQueueItemTool.requiresAdmin).toBe(true);
    expect(() =>
      resolveReviewQueueItemTool.inputSchema.parse({ itemId: 'x', resolution: 'BOGUS' }),
    ).toThrow();
  });

  it('resolveReviewQueueItemTool accepts valid resolution values', () => {
    expect(() =>
      resolveReviewQueueItemTool.inputSchema.parse({ itemId: 'x', resolution: 'IGNORE' }),
    ).not.toThrow();
    expect(() =>
      resolveReviewQueueItemTool.inputSchema.parse({ itemId: 'x', resolution: 'ACCEPT_HUBSPOT' }),
    ).not.toThrow();
    expect(() =>
      resolveReviewQueueItemTool.inputSchema.parse({ itemId: 'x', resolution: 'REJECT' }),
    ).not.toThrow();
  });

  it('resolveReviewQueueItemTool requires itemId', () => {
    expect(() => resolveReviewQueueItemTool.inputSchema.parse({ resolution: 'IGNORE' })).toThrow();
  });

  it('hubspotIntegrationStatusTool returns config snapshot', () => {
    // Smoke — the handler calls prisma; an integration test at the server level covers the happy path.
    expect(hubspotIntegrationStatusTool.name).toBe('hubspot_integration_status');
  });

  it('hubspotIntegrationStatusTool requires admin', () => {
    expect(hubspotIntegrationStatusTool.requiresAdmin).toBe(true);
  });

  it('hubspotCatalogTools exports all 4 tools', () => {
    expect(hubspotCatalogTools).toHaveLength(4);
    const names = hubspotCatalogTools.map((t) => t.name);
    expect(names).toContain('publish_catalog_to_hubspot');
    expect(names).toContain('pull_hubspot_changes');
    expect(names).toContain('resolve_review_queue_item');
    expect(names).toContain('hubspot_integration_status');
  });

  it('adminCtx is valid McpContext shape', () => {
    expect(adminCtx.user.role).toBe('ADMIN');
    expect(adminCtx.user.id).toBe('u-admin');
  });
});
