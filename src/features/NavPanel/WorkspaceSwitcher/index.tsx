'use client';

import { Block, createStaticStyles, cssVar, Icon } from '@lobehub/ui';
import { ChevronsUpDownIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { WorkspaceListItem } from '@/business/client/hooks/useActiveWorkspace';
import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import { SidebarHeaderSelectPopover } from '@/features/NavPanel/SidebarHeaderSelect';

import { openCreateWorkspaceModal } from './CreateWorkspaceModal';
import WorkspaceAvatar from './WorkspaceAvatar';
import WorkspaceSwitcherMenu from './WorkspaceSwitcherMenu';

const styles = createStaticStyles(({ css }) => ({
  trigger: css`
    overflow: hidden;
    flex: none;
    padding: 2px;
    border-radius: ${cssVar.borderRadius};
  `,
}));

/**
 * Scope switcher for the sidebar header.
 *
 * Always renders: personal-only accounts would otherwise have no way to create
 * their first workspace. For them the panel degrades to a single "personal
 * space" row plus the create entry, and the trigger shows a generic glyph
 * instead of an avatar.
 */
const WorkspaceSwitcher = memo(() => {
  const { t } = useTranslation('setting');
  const workspaces = useWorkspaces();
  const activeWorkspaceId = useActiveWorkspaceId();
  const activeWorkspace = useActiveWorkspace();
  const { switchToPersonal, switchWorkspace } = useSwitchWorkspace();

  const handleSelectWorkspace = useCallback(
    (workspace: WorkspaceListItem) => {
      // The switch invalidates every workspace-scoped SWR entry; a rejected
      // refetch must not leave the UI on the old scope with a stale header.
      switchWorkspace(workspace.id).catch((error) => {
        console.error('Failed to switch workspace:', error);
      });
    },
    [switchWorkspace],
  );

  const handleSelectPersonal = useCallback(() => {
    switchToPersonal().catch((error) => {
      console.error('Failed to switch to personal scope:', error);
    });
  }, [switchToPersonal]);

  const handleCreateWorkspace = useCallback(() => {
    openCreateWorkspaceModal();
  }, []);

  return (
    <SidebarHeaderSelectPopover
      width={260}
      content={
        <WorkspaceSwitcherMenu
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
          onCreateWorkspace={handleCreateWorkspace}
          onSelectPersonal={handleSelectPersonal}
          onSelectWorkspace={handleSelectWorkspace}
        />
      }
    >
      <Block
        clickable
        horizontal
        align={'center'}
        aria-label={t('workspace.switchWorkspace')}
        className={styles.trigger}
        data-testid={'workspace-switcher'}
        gap={2}
        title={t('workspace.switchWorkspace')}
        variant={'borderless'}
      >
        <WorkspaceAvatar
          avatar={activeWorkspace?.avatar}
          name={activeWorkspace?.name ?? ''}
          personal={!activeWorkspace}
          size={22}
        />
        <Icon color={cssVar.colorTextQuaternary} icon={ChevronsUpDownIcon} size={12} />
      </Block>
    </SidebarHeaderSelectPopover>
  );
});

WorkspaceSwitcher.displayName = 'WorkspaceSwitcher';

export default WorkspaceSwitcher;
