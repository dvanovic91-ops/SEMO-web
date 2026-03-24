import React, { useRef, useEffect } from 'react';
import { Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ProductNavReplacementProvider, useProductNavReplacement } from './context/ProductNavReplacementContext';
import { AddItemFromQuery } from './components/AddItemFromQuery';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { supabase } from './lib/supabase';
import { getOrCreateVisitSessionId } from './lib/clientSession';

/** 라우트 변경 시 방문 기록 (site_visits). 로그인 시 user_id, 비로그인 시 session_id로 트래픽 집계 */
function TrackVisit() {
  const { pathname } = useLocation();
  const { userId } = useAuth();
  const lastSent = useRef<string>('');
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const key = `${pathname}-${userId ?? 'anon'}`;
    if (lastSent.current === key) return;
    lastSent.current = key;

    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      const payload = userId
        ? { user_id: userId }
        : { user_id: null, session_id: getOrCreateVisitSessionId() };
      supabase.from('site_visits').insert(payload).then(({ error }) => {
        if (error) console.warn('[TrackVisit]', error.message);
      });
    }, 400);
    return () => {
      if (throttleRef.current) clearTimeout(throttleRef.current);
    };
  }, [pathname, userId]);

  return null;
}

/** 라우트 변경 시 스크롤을 맨 위로 이동 (페이지 전환 시 항상 상단 노출) */
function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
import { About } from './pages/About';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { CheckoutComplete } from './pages/CheckoutComplete';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { RegisterShipping } from './pages/RegisterShipping';
import { Shop } from './pages/Shop';
import { BoxHistory } from './pages/BoxHistory';
import { InnerBeauty } from './pages/InnerBeauty';
import { HairBeauty } from './pages/HairBeauty';
import { ProductDetail } from './pages/ProductDetail';
import { SkinTest } from './pages/SkinTest';
import { Profile } from './pages/Profile';
import { ProfileEdit } from './pages/profile/ProfileEdit';
import { ProfileOrders } from './pages/profile/ProfileOrders';
import { ProfilePoints } from './pages/profile/ProfilePoints';
import { ProfileCoupons } from './pages/profile/ProfileCoupons';
import { ProfileTier } from './pages/profile/ProfileTier';
import { ProfileReviews } from './pages/profile/ProfileReviews';
import { ProfileTestResults } from './pages/profile/ProfileTestResults';
import { ProfileTestResultDetail } from './pages/profile/ProfileTestResultDetail';
import { Support } from './pages/Support';
import { Legal } from './pages/Legal';
import { Journey } from './pages/Journey';
import { Promo } from './pages/Promo';
import { Recommendations } from './pages/Recommendations';
import { AuthCallback, AUTH_MESSAGE_TYPE } from './pages/AuthCallback';
import { YandexCallback } from './pages/YandexCallback';
import { Admin } from './pages/admin/Admin';

/** 상품 id가 바뀔 때마다 ProductDetail을 새로 마운트 → effect 중복·#310 완화 */
function ProductDetailWithKey() {
  const { id } = useParams<{ id: string }>();
  return <ProductDetail key={id ?? 'empty'} />;
}

/** 상품 상세(md+)에서 Navbar 고정 시 본문이 헤더에 가리지 않도록 상단 패딩 */
function AppLayout() {
  const { productDesktopNav } = useProductNavReplacement();
  // 네비게이션이 항상 fixed이므로 항상 상단 패딩 필요
  const mdProductPad = 'md:pt-[var(--semo-desktop-header-h)]';
  return (
    <>
      <AddItemFromQuery />
      <Navbar />
      <TrackVisit />
      <ScrollToTop />
      <div
        className={`min-w-0 flex-1 overflow-x-hidden pb-[var(--semo-mobile-tabbar-h)] pt-[var(--semo-mobile-header-h)] md:pb-0 ${mdProductPad}`}
      >
        <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/journey" element={<Journey />} />
              <Route path="/promo" element={<Promo />} />
              <Route path="/skin-test" element={<SkinTest />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/shop/box-history" element={<BoxHistory />} />
              <Route path="/inner-beauty" element={<InnerBeauty />} />
              <Route path="/hair-beauty" element={<HairBeauty />} />
              <Route path="/recommendations" element={<Recommendations />} />
              <Route path="/recommendations/:skinType" element={<Recommendations />} />
              <Route path="/product/:id" element={<ProductDetailWithKey />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/checkout/complete" element={<CheckoutComplete />} />
              <Route path="/support" element={<Support />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/edit" element={<ProfileEdit />} />
              <Route path="/profile/points" element={<ProfilePoints />} />
              <Route path="/profile/coupons" element={<ProfileCoupons />} />
              <Route path="/profile/tier" element={<ProfileTier />} />
              <Route path="/profile/test-results" element={<ProfileTestResults />} />
              <Route path="/profile/test-results/:id" element={<ProfileTestResultDetail />} />
              <Route path="/profile/reviews" element={<ProfileReviews />} />
              <Route path="/profile/orders" element={<ProfileOrders />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/yandex/callback" element={<YandexCallback />} />
              <Route path="/register" element={<Register />} />
              <Route path="/register/shipping" element={<RegisterShipping />} />
            </Routes>
      </div>
      <Footer />
    </>
  );
}

const App: React.FC = () => {
  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-white">
      <AuthProvider>
        <CartProvider>
          <ProductNavReplacementProvider>
            <AppLayout />
          </ProductNavReplacementProvider>
        </CartProvider>
      </AuthProvider>
    </div>
  );
};

export default App;

