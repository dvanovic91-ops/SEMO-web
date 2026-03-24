import React from 'react';
import { ShopCatalog } from './Shop';

/** Inner Beauty — Shop과 동일 레이아웃, 슬롯은 catalog_room_slots.inner_beauty */
export const InnerBeauty: React.FC = () => (
  <ShopCatalog
    category="inner_beauty"
    pageTitle="Fit box"
  />
);
