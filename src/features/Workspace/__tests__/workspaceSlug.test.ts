import { WORKSPACE_SLUG_MAX } from '@lobechat/const';
import { describe, expect, it } from 'vitest';

import { getWorkspaceSlugIssue, isReservedWorkspaceSlug } from '../workspaceSlug';

describe('getWorkspaceSlugIssue', () => {
  it('accepts valid slugs', () => {
    expect(getWorkspaceSlugIssue('acme')).toBeNull();
    expect(getWorkspaceSlugIssue('team-1')).toBeNull();
    expect(getWorkspaceSlugIssue('a1b')).toBeNull();
    expect(getWorkspaceSlugIssue('a'.repeat(WORKSPACE_SLUG_MAX))).toBeNull();
  });

  it('rejects slugs outside the length bounds', () => {
    expect(getWorkspaceSlugIssue('ab')).toBe('length');
    expect(getWorkspaceSlugIssue('a'.repeat(WORKSPACE_SLUG_MAX + 1))).toBe('length');
  });

  it('rejects slugs that break the character pattern', () => {
    expect(getWorkspaceSlugIssue('-acme')).toBe('pattern');
    expect(getWorkspaceSlugIssue('acme-')).toBe('pattern');
    expect(getWorkspaceSlugIssue('Acme')).toBe('pattern');
    expect(getWorkspaceSlugIssue('ac_me')).toBe('pattern');
    expect(getWorkspaceSlugIssue('设计团队')).toBe('pattern');
  });

  it('rejects consecutive hyphens even though the shared pattern allows them', () => {
    expect(getWorkspaceSlugIssue('ac--me')).toBe('consecutive');
  });

  it('rejects first segments already owned by the app', () => {
    expect(getWorkspaceSlugIssue('settings')).toBe('reserved');
    expect(getWorkspaceSlugIssue('invite')).toBe('reserved');
    expect(getWorkspaceSlugIssue('agent')).toBe('reserved');
    expect(getWorkspaceSlugIssue('api')).toBe('reserved');
  });
});

describe('isReservedWorkspaceSlug', () => {
  it('only matches whole segments', () => {
    expect(isReservedWorkspaceSlug('settings')).toBe(true);
    expect(isReservedWorkspaceSlug('settings-team')).toBe(false);
    expect(isReservedWorkspaceSlug('my-agent')).toBe(false);
  });
});
