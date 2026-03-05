-- Market Radar Israel AI - Dashboard Tables

-- Opportunities table
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT,
  impact_score INTEGER NOT NULL DEFAULT 0 CHECK (impact_score >= 0 AND impact_score <= 100),
  priority TEXT NOT NULL DEFAULT 'בינונית' CHECK (priority IN ('גבוהה', 'בינונית', 'נמוכה')),
  recommended_actions TEXT[],
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitors table
CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  change_description TEXT,
  impact TEXT DEFAULT 'בינוני' CHECK (impact IN ('גבוה', 'בינוני', 'נמוך')),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  status TEXT DEFAULT 'חדש' CHECK (status IN ('חדש', 'בטיפול', 'ממתין', 'סגור')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenders table
CREATE TABLE IF NOT EXISTS tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  estimated_value TEXT,
  category TEXT,
  status TEXT DEFAULT 'פעיל' CHECK (status IN ('פעיל', 'נסגר', 'בוטל')),
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trends table
CREATE TABLE IF NOT EXISTS trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  direction TEXT DEFAULT 'עולה' CHECK (direction IN ('עולה', 'יורד', 'יציב')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- News table
CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL,
  url TEXT,
  category TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KPI Stats table for dashboard metrics
CREATE TABLE IF NOT EXISTS kpi_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_name TEXT NOT NULL UNIQUE,
  stat_value INTEGER NOT NULL DEFAULT 0,
  stat_max INTEGER,
  change_percent NUMERIC(5,2),
  change_direction TEXT CHECK (change_direction IN ('up', 'down', 'neutral')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
