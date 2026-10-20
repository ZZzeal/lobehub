'use client';

import { WORKSPACE_SLUG_MAX } from '@lobechat/const';
import {
  Alert,
  Button,
  confirmModal,
  CopyButton,
  Flexbox,
  Input,
  Tag,
  Text,
  TextArea,
  toast,
} from '@lobehub/ui';
import { Form, type FormGroupItem, useForm } from '@lobehub/ui/form';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSWRConfig } from 'swr';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { WORKSPACE_LIST_SWR_KEY } from '@/business/client/hooks/useWorkspaces';
import { useWorkspaceStore } from '@/business/client/workspaceStore';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { FORM_STYLE } from '@/const/layoutTokens';
import { getWorkspaceSlugIssue } from '@/features/Workspace/workspaceSlug';
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole';
import { lambdaClient } from '@/libs/trpc/client';

const NAME_MAX = 255;
const DESCRIPTION_MAX = 1000;
/** Same debounce as the create-workspace modal, so both slug fields feel alike. */
const SLUG_CHECK_DEBOUNCE = 400;

type SlugStatus = 'available' | 'checking' | 'idle' | 'taken';

const isSlugTakenError = (error: unknown): boolean =>
  String((error as { message?: string } | null)?.message ?? '').includes('workspace-slug-taken');

/**
 * Workspace settings › General.
 *
 * Three independent save paths on purpose:
 *
 * - name / description are plain metadata → one call, no confirmation.
 * - the slug renames the URL namespace every member uses, so it asks for
 *   confirmation and then has to reconcile three pieces of state (server,
 *   workspace list cache, active-slug store) before navigating. Missing any
 *   one of them makes `useWorkspaceUrlSync` treat the new URL as an unknown
 *   slug and bounce / 404 the page.
 * - the workspace id is read-only.
 *
 * Write affordances follow `useWorkspaceRole().canManageSettings` (owner and
 * admin) and degrade to read-only rather than hiding the fields, so members
 * can still see which URL they are working in. The real boundary stays the
 * `workspaceAdminProcedure` on `workspace.update`.
 */
const WorkspaceGeneral = memo(() => {
  const { t } = useTranslation('setting');
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const workspace = useActiveWorkspace();
  const { canManageSettings, role } = useWorkspaceRole();
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const form = useForm();

  const remoteName = workspace?.name ?? '';
  const remoteDescription = workspace?.description ?? '';
  const remoteSlug = workspace?.slug ?? '';

  const [name, setName] = useState(remoteName);
  const [description, setDescription] = useState(remoteDescription);
  const [slug, setSlug] = useState(remoteSlug);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSlug, setSavingSlug] = useState(false);

  // Each field tracks its own remote value: a background list revalidation then
  // never clobbers text the user is still typing in a different field.
  useEffect(() => setName(remoteName), [remoteName]);
  useEffect(() => setDescription(remoteDescription), [remoteDescription]);
  useEffect(() => {
    setSlug(remoteSlug);
    setSlugStatus('idle');
  }, [remoteSlug]);

  const readOnly = !canManageSettings;
  const trimmedSlug = slug.trim();
  const slugIssue = getWorkspaceSlugIssue(trimmedSlug);
  const slugDirty = trimmedSlug !== remoteSlug;
  const nameDirty = name.trim() !== remoteName;
  const descriptionDirty = description.trim() !== remoteDescription;
  const canSaveProfile =
    canManageSettings && Boolean(name.trim()) && (nameDirty || descriptionDirty) && !savingProfile;

  // Guards against a slow availability check landing after the input changed.
  const slugRef = useRef(slug);
  slugRef.current = slug;

  useEffect(() => {
    // Unchanged slug: `checkSlugAvailable` would find this very workspace and
    // report it as taken.
    if (!slugDirty || slugIssue) {
      setSlugStatus('idle');
      return;
    }

    setSlugStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { available } = await lambdaClient.workspace.checkSlugAvailable.query({
          slug: trimmedSlug,
        });
        if (slugRef.current.trim() !== trimmedSlug) return;
        setSlugStatus(available ? 'available' : 'taken');
      } catch {
        if (slugRef.current.trim() === trimmedSlug) setSlugStatus('idle');
      }
    }, SLUG_CHECK_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [slugDirty, slugIssue, trimmedSlug]);

  const handleSaveProfile = useCallback(async () => {
    if (!canSaveProfile || !workspace) return;

    setSavingProfile(true);
    try {
      await lambdaClient.workspace.update.mutate({
        description: description.trim(),
        name: name.trim(),
      });
      // The list feeds the switcher, the settings breadcrumb and the route meta
      // title, so refresh it instead of patching the store by hand.
      await mutate(WORKSPACE_LIST_SWR_KEY);
      toast.success(t('workspace.general.updateSuccess'));
    } catch (error) {
      console.error('Failed to update workspace profile:', error);
      toast.error(t('workspace.general.updateFailed'));
    } finally {
      setSavingProfile(false);
    }
  }, [canSaveProfile, description, mutate, name, t, workspace]);

  const handleSaveSlug = useCallback(() => {
    if (!workspace || readOnly || !slugDirty || slugStatus !== 'available') return;

    const nextSlug = trimmedSlug;

    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('workspace.general.url.confirm.content', { old: remoteSlug }),
      okText: t('workspace.general.url.confirm.ok'),
      onOk: async () => {
        setSavingSlug(true);
        try {
          await lambdaClient.workspace.update.mutate({ slug: nextSlug });

          // Order matters: resolve the list first, then the store, then the URL.
          // Navigating against the stale list would make the slug boundary
          // paint its 404 until the revalidation lands.
          await mutate(WORKSPACE_LIST_SWR_KEY);
          setActiveWorkspace(workspace.id, nextSlug);
          navigate(`/${nextSlug}/settings/general`, { replace: true });

          toast.success(t('workspace.general.updateSuccess'));
        } catch (error) {
          if (isSlugTakenError(error)) {
            setSlugStatus('taken');
            return;
          }
          console.error('Failed to update workspace slug:', error);
          toast.error(t('workspace.general.updateFailed'));
        } finally {
          setSavingSlug(false);
        }
      },
      title: t('workspace.general.url.confirm.title', { next: nextSlug }),
    });
  }, [
    mutate,
    navigate,
    readOnly,
    remoteSlug,
    setActiveWorkspace,
    slugDirty,
    slugStatus,
    t,
    trimmedSlug,
    workspace,
  ]);

  if (!workspace) return <RouteLoading />;

  const slugMessage = (() => {
    if (slugIssue === 'length')
      return { danger: true, text: t('workspace.general.url.invalidLength') };
    if (slugIssue === 'pattern')
      return { danger: true, text: t('workspace.general.url.invalidPattern') };
    if (slugIssue === 'consecutive')
      return { danger: true, text: t('workspace.general.url.invalidConsecutive') };
    if (slugIssue === 'reserved')
      return { danger: true, text: t('workspace.general.url.invalidReserved') };
    if (slugStatus === 'taken') return { danger: true, text: t('workspace.general.url.taken') };
    if (slugStatus === 'checking')
      return { danger: false, text: t('workspaceSetting.create.checking') };
    if (slugDirty) return { danger: false, text: t('workspace.general.url.renameWarning') };
    return { danger: false, text: t('workspace.general.url.hint', { max: WORKSPACE_SLUG_MAX }) };
  })();

  const profileGroup: FormGroupItem = {
    children: [
      {
        children: (
          <Input
            disabled={readOnly || savingProfile}
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleSaveProfile}
          />
        ),
        desc: (
          <Flexbox gap={2}>
            <span>{t('workspace.general.name.description')}</span>
            <span>{t('workspace.general.name.hint', { max: NAME_MAX })}</span>
          </Flexbox>
        ),
        label: t('workspace.general.name.title'),
      },
      {
        children: (
          <TextArea
            disabled={readOnly || savingProfile}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        ),
        desc: t('workspace.general.name.hint', { max: DESCRIPTION_MAX }),
        label: t('workspace.description.title'),
        layout: 'vertical',
      },
      {
        children: <Tag>{t(`workspaceSetting.switcher.role.${role}`)}</Tag>,
        label: t('workspace.general.role.label'),
      },
    ],
    extra: (
      <Button
        data-testid={'workspace-name-save'}
        disabled={!canSaveProfile}
        loading={savingProfile}
        size={'small'}
        type={'primary'}
        onClick={handleSaveProfile}
      >
        {t('workspace.general.save')}
      </Button>
    ),
    title: t('workspace.general.title'),
  };

  const urlGroup: FormGroupItem = {
    children: [
      {
        children: (
          <Flexbox gap={6}>
            <Input
              disabled={readOnly || savingSlug}
              maxLength={WORKSPACE_SLUG_MAX}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              onPressEnter={handleSaveSlug}
            />
            <Text fontSize={12} type={slugMessage.danger ? 'danger' : 'secondary'}>
              {slugMessage.text}
            </Text>
          </Flexbox>
        ),
        desc: t('workspace.general.url.description'),
        label: t('workspace.general.url.title'),
      },
    ],
    extra: (
      <Button
        data-testid={'workspace-url-save'}
        loading={savingSlug}
        size={'small'}
        type={'primary'}
        disabled={
          readOnly || savingSlug || !slugDirty || slugIssue !== null || slugStatus !== 'available'
        }
        onClick={handleSaveSlug}
      >
        {t('workspace.general.save')}
      </Button>
    ),
    title: t('workspace.general.url.title'),
  };

  const idGroup: FormGroupItem = {
    children: [
      {
        children: (
          <Flexbox horizontal align={'center'} gap={8}>
            <Text code>{workspace.id}</Text>
            <CopyButton content={workspace.id} size={'small'} />
          </Flexbox>
        ),
        desc: t('workspace.general.id.description'),
        label: t('workspace.general.id.title'),
      },
    ],
    title: t('workspace.general.id.title'),
  };

  return (
    <Flexbox gap={16}>
      {readOnly && <Alert description={t('workspace.general.noPermissionHint')} type={'warning'} />}
      <Form
        collapsible={false}
        form={form}
        items={[profileGroup, urlGroup, idGroup]}
        itemsType={'group'}
        variant={'filled'}
        {...FORM_STYLE}
      />
    </Flexbox>
  );
});

WorkspaceGeneral.displayName = 'WorkspaceGeneral';

export default WorkspaceGeneral;
