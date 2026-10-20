'use client';

import { Avatar, Icon } from '@lobehub/ui';
import { UserRoundIcon } from 'lucide-react';
import { memo } from 'react';

/**
 * Deterministic tint per workspace name, so the same workspace keeps the same
 * colour across sessions without storing anything.
 */
const TINTS = ['#5B8DEF', '#7C5CFF', '#00A8A8', '#E8833A', '#D2547A', '#4C9A5B'];

const tintFor = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 100_000;

  return TINTS[hash % TINTS.length];
};

interface WorkspaceAvatarProps {
  avatar?: string | null;
  name: string;
  personal?: boolean;
  size?: number;
}

/**
 * `Avatar` renders a blank square when neither an image nor an initial is
 * supplied, which made freshly-created workspaces look like loading skeletons.
 * This always produces something recognisable: the image, a tinted initial, or
 * a glyph for personal scope.
 */
const WorkspaceAvatar = memo<WorkspaceAvatarProps>(({ avatar, name, personal, size = 24 }) => {
  if (personal) {
    return (
      <Avatar
        avatar={<Icon icon={UserRoundIcon} size={size * 0.5} />}
        shape={'square'}
        size={size}
      />
    );
  }

  if (avatar) return <Avatar avatar={avatar} shape={'square'} size={size} />;

  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Avatar
      avatar={<span style={{ fontSize: size * 0.45, fontWeight: 600 }}>{initial}</span>}
      shape={'square'}
      size={size}
      style={{ background: tintFor(name), color: '#fff' }}
    />
  );
});

WorkspaceAvatar.displayName = 'WorkspaceAvatar';

export default WorkspaceAvatar;
