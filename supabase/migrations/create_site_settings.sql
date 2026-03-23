-- site_settings: 사이트 전역 설정 (key-value)
-- 히어로 이미지 URL, 링크 등을 저장

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능 (프론트에서 히어로 이미지 로드)
CREATE POLICY "site_settings: public read" ON site_settings
  FOR SELECT USING (true);

-- 관리자만 수정 가능 (profiles.is_admin = true)
CREATE POLICY "site_settings: admin insert" ON site_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "site_settings: admin update" ON site_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "site_settings: admin delete" ON site_settings
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
