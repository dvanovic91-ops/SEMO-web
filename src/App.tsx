import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';

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
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { RegisterShipping } from './pages/RegisterShipping';
import { Shop } from './pages/Shop';
import { SkinTest } from './pages/SkinTest';
import { Profile } from './pages/Profile';
import { ProfileEdit } from './pages/profile/ProfileEdit';
import { ProfileOrders } from './pages/profile/ProfileOrders';
import { ProfilePoints } from './pages/profile/ProfilePoints';
import { ProfileReviews } from './pages/profile/ProfileReviews';
import { ProfileTestResults } from './pages/profile/ProfileTestResults';
import { Support } from './pages/Support';
import { AuthCallback, AUTH_MESSAGE_TYPE } from './pages/AuthCallback';
import { Admin } from './pages/admin/Admin';

const App: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AuthProvider>
        <CartProvider>
          <Navbar />
          <ScrollToTop />
          {/* 모바일에서 하단 고정 바 때문에 본문이 가려지지 않도록 패딩 */}
          <div className="flex-1 pb-16 md:pb-0">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/skin-test" element={<SkinTest />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/support" element={<Support />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/edit" element={<ProfileEdit />} />
              <Route path="/profile/points" element={<ProfilePoints />} />
              <Route path="/profile/test-results" element={<ProfileTestResults />} />
              <Route path="/profile/reviews" element={<ProfileReviews />} />
              <Route path="/profile/orders" element={<ProfileOrders />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/register" element={<Register />} />
              <Route path="/register/shipping" element={<RegisterShipping />} />
            </Routes>
          </div>
          <Footer />
        </CartProvider>
      </AuthProvider>
    </div>
  );
};

export default App;

