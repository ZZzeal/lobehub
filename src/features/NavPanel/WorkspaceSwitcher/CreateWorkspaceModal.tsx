'use client';

import {
  isWorkspaceSlugFormatValid,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
} from '@lobechat/const';
import {
  Button,
  createModal,
  Flexbox,
  Input,
  ModalFooter,
  Text,
  toast,
  useModalContext,
} from '@lobehub/ui';
import { t as translate } from 'i18next';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSWRConfig } from 'swr';

import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { WORKSPACE_LIST_SWR_KEY } from '@/business/client/hooks/useWorkspaces';
import { lambdaClient } from '@/libs/trpc/client';

type SlugStatus = 'available' | 'checking' | 'idle' | 'invalid' | 'taken';

/**
 * Derives a URL-safe slug from a display name. Non-latin names reduce to an
 * empty string on purpose — inventing a slug from pinyin or transliteration
 * would hand the user a URL they did not choose, so the field stays empty and
 * keeps the hint visible instead.
 */
const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, WORKSPACE_SLUG_MAX);

const isSlugTakenError = (error: unknown) =>
  typeof (error as { message?: string })?.message === 'string' &&
  (error as { message: string }).message.includes('workspace-slug-taken');

const CreateWorkspaceContent = memo(() => {
  const { t } = useTranslation(['setting', 'common']);
  const { close } = useModalContext();
  const { mutate } = useSWRConfig();
  const { switchWorkspace } = useSwitchWorkspace();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  // Once the user edits the slug by hand, stop overwriting it from the name.
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<SlugStatus>('idle');
  const [loading, setLoading] = useState(false);

  // Guards against a slow availability check landing after the input changed.
  const slugRef = useRef('');
  slugRef.current = slug;

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!slugTouched) setSlug(toSlug(value));
    },
    [slugTouched],
  );

  useEffect(() => {
    if (!slug) {
      setStatus('idle');
      return;
    }

    if (slug.length < WORKSPACE_SLUG_MIN || !isWorkspaceSlugFormatValid(slug)) {
      setStatus('invalid');
      return;
    }

    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { available } = await lambdaClient.workspace.checkSlugAvailable.query({ slug });
        if (slugRef.current !== slug) return;
        setStatus(available ? 'available' : 'taken');
      } catch {
        if (slugRef.current === slug) setStatus('idle');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  const canSubmit = Boolean(name.trim()) && status === 'available' && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const workspace = await lambdaClient.workspace.create.mutate({
        name: name.trim(),
        slug,
      });

      await mutate(WORKSPACE_LIST_SWR_KEY);
      toast.success(t('workspaceSetting.create.success'));

      // Pass the slug explicitly: the list cache above is still resolving, so
      // `switchWorkspace` cannot look this workspace up yet.
      await switchWorkspace(workspace.id, workspace.slug);
      close();
    } catch (error) {
      if (isSlugTakenError(error)) {
        setStatus('taken');
        return;
      }
      console.error('Failed to create workspace:', error);
      toast.error(t('operationFailed', { ns: 'common' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Flexbox gap={16} paddingBlock={8} paddingInline={16}>
        <Flexbox gap={8}>
          <span>{t('workspaceSetting.create.name')}</span>
          <Input
            autoFocus
            maxLength={255}
            placeholder={t('workspaceSetting.create.namePlaceholder')}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </Flexbox>

        <Flexbox gap={8}>
          <span>{t('workspaceSetting.create.slug')}</span>
          <Input
            placeholder={'my-workspace'}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <Text
            fontSize={12}
            type={status === 'taken' || status === 'invalid' ? 'danger' : 'secondary'}
          >
            {status === 'invalid' && t('workspaceSetting.create.invalid')}
            {status === 'taken' && t('workspaceSetting.create.taken')}
            {status === 'checking' && t('workspaceSetting.create.checking')}
            {(status === 'idle' || status === 'available') && t('workspaceSetting.create.slugHint')}
          </Text>
        </Flexbox>
      </Flexbox>
      <ModalFooter>
        <Button onClick={close}>{t('cancel', { ns: 'common' })}</Button>
        <Button disabled={!canSubmit} loading={loading} type={'primary'} onClick={handleSubmit}>
          {t('workspaceSetting.create.submit')}
        </Button>
      </ModalFooter>
    </>
  );
});

CreateWorkspaceContent.displayName = 'CreateWorkspaceContent';

export const openCreateWorkspaceModal = () =>
  createModal({
    content: <CreateWorkspaceContent />,
    footer: null,
    styles: { content: { padding: 0 } },
    title: translate('workspaceSetting.create.title', { ns: 'setting' }),
    width: 460,
  });
