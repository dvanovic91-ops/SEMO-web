import React from 'react';
import { ShopCatalog } from './Shop';

/** Hair Beauty — Shop과 동일 레이아웃, `main_layout_slots.category = hair_beauty` */
export const HairBeauty: React.FC = () => (
  <ShopCatalog
    category="hair_beauty"
    pageTitle="Hair box"
    pageSubtitle="Корейский уход за волосами — шампуни, маски, сыворотки и масла для здоровых и блестящих волос."
  />
);
