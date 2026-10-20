'use client';

import { Button, Center, Flexbox, Icon, Text } from '@lobehub/ui';
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { lambdaClient } from '@/libs/trpc/client';

type InviteState = 'accepting' | 'joined' | 'failed';

/**
 * Maps the server's error message onto a translation key. The router throws
 * bare slugs (`invitation-expired`) rather than prose so the copy can live in
 * the locale bundles.
 */
const errorKeyFor = (error: unknown): string => {
  const message =
    typeof (error as { message?: string })?.message === 'string'
      ? (error as { message: string }).message
      : '';

  for (const slug of [
    'invitation-not-found',
    'invitation-expired',
    'invitation-accepted',
    'invitation-revoked',
    'invitation-email-mismatch',
    'workspace-not-found',
  ]) {
    if (message.includes(slug)) return slug;
  }

  return 'invitation-not-found';
};

const InvitePage = memo(() => {
  const { t } = useTranslation('setting');
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { switchWorkspace } = useSwitchWorkspace();

  const [state, setState] = useState<InviteState>('accepting');
  const [errorKey, setErrorKey] = useState('invitation-not-found');

  // React 18 StrictMode runs effects twice in dev; redeeming the same token
  // twice would flip it to `accepted` and fail the second attempt with a
  // confusing "already used" screen.
  const redeemed = useRef(false);

  useEffect(() => {
    if (!token || redeemed.current) return;
    redeemed.current = true;

    let cancelled = false;

    const accept = async () => {
      try {
        const workspace = await lambdaClient.workspaceMember.accept.mutate({ token });
        if (cancelled) return;

        setState('joined');
        // `switchWorkspace` navigates to `/{slug}` on success, so the page
        // unmounts on its own — no explicit redirect needed.
        await switchWorkspace(workspace.id, workspace.slug);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to accept workspace invitation:', error);
        setErrorKey(errorKeyFor(error));
        setState('failed');
      }
    };

    void accept();

    return () => {
      cancelled = true;
    };
  }, [switchWorkspace, token]);

  if (state === 'joined') {
    return (
      <Center height={'100%'} width={'100%'}>
        <Flexbox align={'center'} gap={12}>
          <Icon color={'var(--ant-color-success)'} icon={CheckCircle2Icon} size={32} />
          <Text fontSize={16} weight={500}>
            {t('workspaceSetting.invite.joined')}
          </Text>
        </Flexbox>
      </Center>
    );
  }

  if (state === 'failed') {
    return (
      <Center height={'100%'} width={'100%'}>
        <Flexbox align={'center'} gap={12} style={{ maxWidth: 420 }} width={'100%'}>
          <Icon color={'var(--ant-color-warning)'} icon={AlertTriangleIcon} size={32} />
          <Text align={'center'} fontSize={15} weight={500}>
            {t('workspaceSetting.invite.title')}
          </Text>
          <Text align={'center'} fontSize={13} type={'secondary'}>
            {t(`workspaceSetting.invite.error.${errorKey}`)}
          </Text>
          <Button style={{ marginTop: 8 }} onClick={() => navigate('/')}>
            {t('workspaceSetting.invite.goHome')}
          </Button>
        </Flexbox>
      </Center>
    );
  }

  return (
    <Center height={'100%'} width={'100%'}>
      <Flexbox align={'center'} gap={12}>
        <Icon spin icon={Loader2Icon} size={24} />
        <Text fontSize={14} type={'secondary'}>
          {t('workspaceSetting.invite.accepting')}
        </Text>
      </Flexbox>
    </Center>
  );
});

InvitePage.displayName = 'WorkspaceInvitePage';

export default InvitePage;
