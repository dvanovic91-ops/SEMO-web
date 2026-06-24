import React from 'react';
import { Navigate } from 'react-router-dom';

/** 레거시 URL — 개인·배송 정보는 /profile/edit 에서 입력 */
export const RegisterShipping: React.FC = () => {
  return <Navigate to="/profile/edit" replace />;
};
