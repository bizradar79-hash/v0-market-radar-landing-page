"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react"

const newsItems = [
  {
    id: 1,
    title: "סטארטאפ ישראלי גייס 50 מיליון דולר בסבב B",
    summary: "חברת טכנולוגיה ישראלית בתחום ה-AI השלימה סבב גיוס משמעותי בהובלת קרן אמריקאית",
    source: "כלכליסט",
    category: "גיוסים",
    sentiment: "positive",
    timeAgo: "לפני שעה",
    url: "#",
  },
  {
    id: 2,
    title: "רגולציה חדשה בתחום הפינטק נכנסת לתוקף",
    summary: "בנק ישראל פרסם הנחיות חדשות המחייבות חברות פינטק לעמוד בתקנים מחמירים",
    source: "גלובס",
    category: "רגולציה",
    sentiment: "neutral",
    timeAgo: "לפני 3 שעות",
    url: "#",
  },
  {
    id: 3,
    title: "שיתוף פעולה בין חברות טכנולוגיה מובילות",
    summary: "שתי חברות ישראליות מובילות הכריזו על שותפות אסטרטגית לפיתוח פתרונות AI",
    source: "TheMarker",
    category: "שותפויות",
    sentiment: "positive",
    timeAgo: "לפני 6 שעות",
    url: "#",
  },
  {
    id: 4,
    title: "דוח: ירידה בהשקעות הון סיכון ברבעון האחרון",
    summary: "על פי נתוני IVC, חלה ירידה של 15% בהשקעות בסטארטאפים ישראליים",
    source: "Geektime",
    category: "השקעות",
    sentiment: "negative",
    timeAgo: "לפני 12 שעות",
    url: "#",
  },
  {
    id: 5,
    title: "מכרז ממשלתי חדש למערכות מידע בהיקף 50 מיליון",
    summary: "משרד האוצר פרסם מכרז לפיתוח והטמעת מערכת ניהול מידע ארגונית",
    source: "מעריב",
    category: "מכרזים",
    sentiment: "positive",
    timeAgo: "לפני יום",
    url: "#",
  },
  {
    id: 6,
    title: "TechVision משיקה מוצר חדש בתחום ה-BI",
    summary: "המתחרה הישיר שלכם השיק פלטפורמה חדשה למודיעין עסקי עם יכולות AI",
    source: "מעקב מתחרים",
    category: "מתחרים",
    sentiment: "negative",
    timeAgo: "לפני יום",
    url: "#",
  },
  {
    id: 7,
    title: "כנס הייטק ישראל 2026 יתקיים בחודש הבא",
    summary: "כנס הטכנולוגיה הגדול בישראל יתקיים בתל אביב עם למעלה מ-5,000 משתתפים צפויים",
    source: "Tech12",
    category: "אירועים",
    sentiment: "neutral",
    timeAgo: "לפני יומיים",
    url: "#",
  },
  {
    id: 8,
    title: "מחקר: 70% מהעסקים מתכננים להשקיע ב-AI",
    summary: "סקר חדש מראה כי רוב העסקים הקטנים והבינוניים בישראל מתכננים לאמץ טכנולוגיות AI",
    source: "BDI",
    category: "מחקרים",
    sentiment: "positive",
    timeAgo: "לפני יומיים",
    url: "#",
  },
]

function getSentimentBadge(sentiment: string) {
  switch (sentiment) {
    case "positive":
      return (
        <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
          <TrendingUp className="ml-1 h-3 w-3" />
          חיובי
        </Badge>
      )
    case "negative":
      return (
        <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20">
          <TrendingDown className="ml-1 h-3 w-3" />
          שלילי
        </Badge>
      )
    default:
      return (
        <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">
          <Minus className="ml-1 h-3 w-3" />
          ניטרלי
        </Badge>
      )
  }
}

function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    "גיוסים": "bg-blue-500/10 text-blue-500",
    "רגולציה": "bg-purple-500/10 text-purple-500",
    "שותפויות": "bg-green-500/10 text-green-500",
    "השקעות": "bg-yellow-500/10 text-yellow-500",
    "מכרזים": "bg-cyan-500/10 text-cyan-500",
    "מתחרים": "bg-red-500/10 text-red-500",
    "אירועים": "bg-pink-500/10 text-pink-500",
    "מחקרים": "bg-indigo-500/10 text-indigo-500",
  }
  return colors[category] || "bg-gray-500/10 text-gray-500"
}

export default function NewsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">חדשות</h1>
        <p className="text-muted-foreground">עדכונים וחדשות רלוונטיות לעסק שלך</p>
      </div>

      {/* News Feed */}
      <div className="space-y-4">
        {newsItems.map((item) => (
          <Card key={item.id} className="border-border bg-card transition-colors hover:bg-card/80">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={getCategoryColor(item.category)}>
                      {item.category}
                    </Badge>
                    {getSentimentBadge(item.sentiment)}
                  </div>
                  
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  
                  <p className="mb-3 text-sm text-muted-foreground">
                    {item.summary}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-medium">{item.source}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.timeAgo}
                    </span>
                  </div>
                </div>
                
                <Button variant="ghost" size="icon" className="shrink-0">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
