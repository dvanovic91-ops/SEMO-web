import React from 'react';
import { ShopCatalog } from './Shop';

/** Inner Beauty — Shop과 동일 레이아웃, `main_layout_slots.category = inner_beauty` */
export const InnerBeauty: React.FC = () => (
  <ShopCatalog
    category="inner_beauty"
    pageTitle="Inner Beauty Box"
    pageSubtitle="Красота изнутри — витамины, коллаген и добавки для здоровья кожи, волос и ногтей."
  />
);
