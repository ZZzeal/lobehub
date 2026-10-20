'use client';

import {
  Block,
  createStaticStyles,
  cssVar,
  Divider,
  Flexbox,
  Icon,
  Text,
  usePopoverContext,
} from '@lobehub/ui';
import { CheckIcon, PlusIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { WorkspaceListItem } from '@/business/client/hooks/useActiveWorkspace';
import type { WorkspaceUiRole } from '@/hooks/useWorkspaceRole';

import WorkspaceAvatar from './WorkspaceAvatar';

const styles = createStaticStyles(({ css }) => ({
  current: css`
    background: ${cssVar.colorFillTertiary};
  `,
  role: css`
    flex: none;

    padding-block: 1px;
    padding-inline: 6px;
    border-radius: 4px;

    font-size: 11px;
    line-height: 16px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  row: css`
    cursor: pointer;

    overflow: hidden;
    flex: none;

    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  section: css`
    padding-block: 6px 2px;
    padding-inline: 8px;

    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

interface SwitcherRowProps {
  active: boolean;
  avatar?: string | null;
  name: string;
  onClick: () => void;
  role?: WorkspaceUiRole;
  /**
   * Personal scope has no avatar of its own; a glyph keeps the row from
   * rendering as an empty square with the name's initial.
   */
  usePersonalIcon?: boolean;
}

const SwitcherRow = memo<SwitcherRowProps>(
  ({ active, avatar, name, onClick, role, usePersonalIcon }) => {
    const { t } = useTranslation('setting');

    return (
      <Block
        clickable
        horizontal
        align={'center'}
        className={active ? `${styles.row} ${styles.current}` : styles.row}
        flex={'none'}
        gap={8}
        height={36}
        variant={'borderless'}
        onClick={onClick}
      >
        <WorkspaceAvatar
          avatar={avatar}
          name={name}
          personal={usePersonalIcon && !avatar}
          size={24}
        />
        <Text
          ellipsis
          color={active ? cssVar.colorText : cssVar.colorTextSecondary}
          style={{ flex: 1, minWidth: 0 }}
          weight={active ? 500 : undefined}
        >
          {name}
        </Text>
        {role && <span className={styles.role}>{t(`workspaceSetting.switcher.role.${role}`)}</span>}
        {active && <Icon color={cssVar.colorText} icon={CheckIcon} size={14} />}
      </Block>
    );
  },
);

SwitcherRow.displayName = 'WorkspaceSwitcherRow';

interface WorkspaceSwitcherMenuProps {
  activeWorkspaceId: string | null;
  onCreateWorkspace: () => void;
  onSelectPersonal: () => void;
  onSelectWorkspace: (workspace: WorkspaceListItem) => void;
  workspaces: WorkspaceListItem[];
}

/**
 * Scope switcher body. Personal scope comes first, then every workspace the
 * caller belongs to. The list comes from `workspace.list`, which is
 * user-scoped rather than workspace-scoped, so it survives a switch.
 */
const WorkspaceSwitcherMenu = memo<WorkspaceSwitcherMenuProps>(
  ({ activeWorkspaceId, onCreateWorkspace, onSelectPersonal, onSelectWorkspace, workspaces }) => {
    const { t } = useTranslation('setting');
    const { close } = usePopoverContext();

    const select = (action: () => void) => () => {
      close();
      action();
    };

    return (
      <Flexbox gap={1} padding={6}>
        <SwitcherRow
          usePersonalIcon
          active={!activeWorkspaceId}
          name={t('workspaceSetting.switcher.personalSpace')}
          onClick={select(onSelectPersonal)}
        />

        <Divider style={{ marginBlock: 4 }} />

        <div className={styles.section}>{t('workspaceSetting.switcher.workspaces')}</div>
        {workspaces.map((workspace) => (
          <SwitcherRow
            active={workspace.id === activeWorkspaceId}
            avatar={workspace.avatar}
            key={workspace.id}
            name={workspace.name}
            role={(workspace.role as WorkspaceUiRole | undefined) ?? 'viewer'}
            onClick={select(() => onSelectWorkspace(workspace))}
          />
        ))}

        <Divider style={{ marginBlock: 4 }} />
        <Block
          clickable
          horizontal
          align={'center'}
          className={styles.row}
          flex={'none'}
          gap={8}
          height={36}
          variant={'borderless'}
          onClick={select(onCreateWorkspace)}
        >
          <Icon icon={PlusIcon} size={16} style={{ marginInline: 4 }} />
          <Text color={cssVar.colorTextSecondary} fontSize={13} style={{ flex: 1 }}>
            {t('workspaceSetting.switcher.create')}
          </Text>
        </Block>
      </Flexbox>
    );
  },
);

WorkspaceSwitcherMenu.displayName = 'WorkspaceSwitcherMenu';

export default WorkspaceSwitcherMenu;
