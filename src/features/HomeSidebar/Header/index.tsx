'use client';

import { Flexbox } from '@lobehub/ui';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import WorkspaceSwitcher from '@/features/NavPanel/WorkspaceSwitcher';

import InboxButton from './components/InboxButton';
import Nav from './components/Nav';
import User from './components/User';

const Header = () => {
  return (
    <>
      <SideBarHeaderLayout
        right={<InboxButton />}
        showBack={false}
        left={
          <Flexbox horizontal align={'center'} gap={2} style={{ minWidth: 0 }}>
            <User />
            <WorkspaceSwitcher />
          </Flexbox>
        }
      />
      <Nav />
    </>
  );
};

export default Header;
