import React from 'react';
import { ShopCatalog } from './Shop';

/** Hair Beauty — Shop과 동일 레이아웃, 슬롯은 catalog_room_slots.hair_beauty */
export const HairBeauty: React.FC = () => (
  <ShopCatalog
    category="hair_beauty"
    pageTitle="Hair box"
  />
);
