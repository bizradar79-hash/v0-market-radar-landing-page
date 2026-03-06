"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { X, Plus, Save, Building2, KeyRound, Bell, User } from "lucide-react"

export default function SettingsPage() {
  const [companyData, setCompanyData] = useState({
    name: "חברת הדגמה בע\"מ",
    website: "https://demo-company.co.il",
    industry: "טכנולוגיה",
    city: "תל אביב",
    size: "11-50 עובדים",
    description: "חברת טכנולוגיה המתמחה בפתרונות AI לעסקים קטנים ובינוניים",
  })

  const [keywords, setKeywords] = useState([
    "בינה מלאכותית",
    "אוטומציה",
    "SaaS",
    "מודיעין עסקי",
  ])
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

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()])
      setNewKeyword("")
    }
  }

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword))
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
                />
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Save className="ml-2 h-4 w-4" />
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
                {keywords.map((keyword) => (
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
                ))}
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Save className="ml-2 h-4 w-4" />
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
                  { key: "opportunities", label: "הזדמנויות חדשות" },
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
                    defaultValue="משתמש ראשי"
                    className="border-border bg-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">אימייל</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue="user@demo-company.co.il"
                    className="border-border bg-input"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">טלפון</Label>
                  <Input
                    id="phone"
                    defaultValue="050-1234567"
                    className="border-border bg-input"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">תפקיד</Label>
                  <Input
                    id="role"
                    defaultValue="מנהל חשבון"
                    className="border-border bg-input"
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
