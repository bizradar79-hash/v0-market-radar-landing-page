"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { X, Plus, Save, Building2, KeyRound, Bell, User, Loader2 } from "lucide-react"

interface CompanyData {
  name: string
  website: string
  industry: string
  city: string
  size: string
  description: string
}

interface UserData {
  fullName: string
  email: string
  phone: string
  role: string
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [companyData, setCompanyData] = useState<CompanyData>({
    name: "",
    website: "",
    industry: "",
    city: "",
    size: "",
    description: "",
  })

  const [userData, setUserData] = useState<UserData>({
    fullName: "",
    email: "",
    phone: "",
    role: "",
  })

  const [keywords, setKeywords] = useState<string[]>([])
  const [newKeyword, setNewKeyword] = useState("")

  const [notifications, setNotifications] = useState({
    opportunities: true,
    competitors: true,
    leads: true,
    tenders: true,
    trends: false,
    news: false,
    weeklyReport: true,
    emailAlerts: true,
  })

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Fetch company data
        const { data: company } = await supabase
          .from('companies')
          .select('*')
          .eq('id', user.id)
          .single()
        
        if (company) {
          setCompanyData({
            name: company.name || "",
            website: company.website || "",
            industry: company.industry || "",
            city: company.city || "",
            size: company.size || "",
            description: company.description || "",
          })
          
          // Extract keywords from company data
          if (company.keywords && Array.isArray(company.keywords)) {
            setKeywords(company.keywords)
          }
        }

        // Set user data from auth
        setUserData({
          fullName: user.user_metadata?.full_name || "",
          email: user.email || "",
          phone: user.user_metadata?.phone || "",
          role: user.user_metadata?.role || "מנהל חשבון",
        })
      }
      
      setIsLoading(false)
    }

    fetchData()
  }, [])

  const saveCompanyData = async () => {
    setIsSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      await supabase
        .from('companies')
        .update({
          name: companyData.name,
          website: companyData.website,
          industry: companyData.industry,
          city: companyData.city,
          size: companyData.size,
          description: companyData.description,
        })
        .eq('id', user.id)
    }
    setIsSaving(false)
  }

  const saveKeywords = async () => {
    setIsSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      await supabase
        .from('companies')
        .update({ keywords })
        .eq('id', user.id)
    }
    setIsSaving(false)
  }

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()])
      setNewKeyword("")
    }
  }

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword))
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>
        <p className="text-muted-foreground">נהל את הגדרות החשבון והחברה</p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-secondary">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">פרופיל חברה</span>
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">מילות מפתח</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">התראות</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">חשבון</span>
          </TabsTrigger>
        </TabsList>

        {/* Company Profile Tab */}
        <TabsContent value="company">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">פרופיל חברה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">שם החברה</Label>
                  <Input
                    id="companyName"
                    value={companyData.name}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, name: e.target.value })
                    }
                    className="border-border bg-input"
                    placeholder="הזן שם חברה"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">אתר אינטרנט</Label>
                  <Input
                    id="website"
                    value={companyData.website}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, website: e.target.value })
                    }
                    className="border-border bg-input"
                    dir="ltr"
                    placeholder="https://example.co.il"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">תעשייה</Label>
                  <Input
                    id="industry"
                    value={companyData.industry}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, industry: e.target.value })
                    }
                    className="border-border bg-input"
                    placeholder="בחר תעשייה"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">עיר</Label>
                  <Input
                    id="city"
                    value={companyData.city}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, city: e.target.value })
                    }
                    className="border-border bg-input"
                    placeholder="הזן עיר"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="size">גודל חברה</Label>
                  <Input
                    id="size"
                    value={companyData.size}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, size: e.target.value })
                    }
                    className="border-border bg-input"
                    placeholder="לדוגמה: 11-50 עובדים"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">תיאור החברה</Label>
                <Textarea
                  id="description"
                  value={companyData.description}
                  onChange={(e) =>
                    setCompanyData({ ...companyData, description: e.target.value })
                  }
                  className="min-h-[100px] border-border bg-input"
                  placeholder="תאר את פעילות החברה..."
                />
              </div>
              <Button 
                onClick={saveCompanyData}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                שמור שינויים
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keywords Tab */}
        <TabsContent value="keywords">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">מילות מפתח למעקב</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="הוסף מילת מפתח חדשה"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                  className="border-border bg-input"
                />
                <Button onClick={addKeyword} className="bg-primary text-primary-foreground">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground">לא הוגדרו מילות מפתח עדיין</p>
                ) : (
                  keywords.map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className="flex items-center gap-1 bg-primary/10 px-3 py-1.5 text-primary"
                    >
                      {keyword}
                      <button
                        onClick={() => removeKeyword(keyword)}
                        className="mr-1 rounded-full hover:bg-primary/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <Button 
                onClick={saveKeywords}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                שמור שינויים
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">הגדרות התראות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">התראות מודולים</h3>
                {[
                  { key: "competitors", label: "פעילות מתחרים" },
                  { key: "leads", label: "לידים חדשים" },
                  { key: "tenders", label: "מכרזים רלוונטיים" },
                  { key: "trends", label: "טרנדים חדשים" },
                  { key: "news", label: "חדשות רלוונטיות" },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4"
                  >
                    <Label htmlFor={item.key} className="text-foreground">
                      {item.label}
                    </Label>
                    <Switch
                      id={item.key}
                      checked={notifications[item.key as keyof typeof notifications]}
                      onCheckedChange={(checked) =>
                        setNotifications({ ...notifications, [item.key]: checked })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">הגדרות כלליות</h3>
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                  <Label htmlFor="weeklyReport" className="text-foreground">
                    דוח שבועי במייל
                  </Label>
                  <Switch
                    id="weeklyReport"
                    checked={notifications.weeklyReport}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, weeklyReport: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                  <Label htmlFor="emailAlerts" className="text-foreground">
                    התראות דחופות במייל
                  </Label>
                  <Switch
                    id="emailAlerts"
                    checked={notifications.emailAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, emailAlerts: checked })
                    }
                  />
                </div>
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Save className="ml-2 h-4 w-4" />
                שמור שינויים
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">פרטי חשבון</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">שם מלא</Label>
                  <Input
                    id="fullName"
                    value={userData.fullName}
                    onChange={(e) => setUserData({ ...userData, fullName: e.target.value })}
                    className="border-border bg-input"
                    placeholder="הזן שם מלא"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">אימייל</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userData.email}
                    disabled
                    className="border-border bg-input opacity-60"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">טלפון</Label>
                  <Input
                    id="phone"
                    value={userData.phone}
                    onChange={(e) => setUserData({ ...userData, phone: e.target.value })}
                    className="border-border bg-input"
                    dir="ltr"
                    placeholder="050-0000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">תפקיד</Label>
                  <Input
                    id="role"
                    value={userData.role}
                    onChange={(e) => setUserData({ ...userData, role: e.target.value })}
                    className="border-border bg-input"
                    placeholder="הזן תפקיד"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>חבילה נוכחית</Label>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                  <Badge className="bg-primary/10 text-primary">מקצועי</Badge>
                  <span className="text-foreground">₪299/חודש</span>
                  <Button variant="link" className="mr-auto text-primary">
                    שדרג חבילה
                  </Button>
                </div>
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Save className="ml-2 h-4 w-4" />
                שמור שינויים
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
