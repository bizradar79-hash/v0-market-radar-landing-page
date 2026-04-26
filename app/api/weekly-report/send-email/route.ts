export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { renderWeeklyReportEmail } from '@/lib/emails/weekly-report-email'
import { renderWeeklyReportText } from '@/lib/emails/weekly-report-text'
import { generateWeeklyReportPdf } from '@/lib/pdf/weekly-report-pdf'

export async function POST() {
  try {
    // 1. Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Get company
    const { data: company } = await supabase
      .from('companies')
      .select('name, industry, business_profile, last_report')
      .eq('id', user.id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'לא נמצאה חברה' }, { status: 404 })
    }

    const companyName = company.business_profile?.name || company.name || 'העסק שלך'
    const weekDate = new Date().toLocaleDateString('he-IL', {
      year: 'numeric', month: 'long', day: 'numeric',
    })

    // 3. Get report data (from cache or generate)
    let report = company.last_report as any
    let highlights: any = null

    if (report?.executive_summary) {
      // Full report cached — extract highlights from it
      highlights = {
        competitors: report.competitors?.summary || 'אין מידע זמין',
        trends: report.trends?.market_insights?.[0] || report.trends?.hot_keywords?.join(', ') || 'אין מידע זמין',
        news: report.news_tenders?.relevant_news?.[0]?.title || 'אין מידע זמין',
        conferences: report.news_tenders?.upcoming_conferences?.[0]?.name || 'אין מידע זמין',
        tenders: report.news_tenders?.active_tenders?.length
          ? `${report.news_tenders.active_tenders.length} מכרזים פעילים`
          : 'אין מכרזים פתוחים',
      }
    } else {
      // No cached report — generate highlights from DB
      const today = new Date().toISOString().split('T')[0]
      const [
        { data: competitors },
        { data: tenders },
        { data: conferences },
        { data: news },
      ] = await Promise.all([
        supabase.from('competitors').select('name, threat_score').eq('company_id', user.id).order('threat_score', { ascending: false }).limit(10),
        supabase.from('tenders').select('title').eq('company_id', user.id).gte('deadline', today).limit(10),
        supabase.from('conferences').select('name, date').eq('company_id', user.id).gte('date', today).order('date', { ascending: true }).limit(3),
        supabase.from('news').select('title').eq('company_id', user.id).order('published_at', { ascending: false }).limit(3),
      ])

      const highThreat = (competitors || []).filter((c: any) => (c.threat_score || 0) >= 70).length
      highlights = {
        competitors: competitors?.length ? `${competitors.length} מתחרים, ${highThreat} בעלי ציון איום גבוה` : 'אין מידע זמין',
        trends: 'לא נמצא טרנד מוביל',
        news: news?.[0]?.title || 'אין חדשות רלוונטיות',
        conferences: conferences?.[0] ? `${conferences[0].name}${conferences[0].date ? ` (${conferences[0].date})` : ''}` : 'אין כנסים קרובים',
        tenders: tenders?.length ? `${tenders.length} מכרזים פתוחים` : 'אין מכרזים פתוחים',
      }
      report = {}
    }

    // 4. Generate email HTML + plain text
    const emailHtml = renderWeeklyReportEmail({
      companyName,
      weekDate,
      highlights,
      report,
    })
    const emailPlainText = renderWeeklyReportText({
      companyName,
      weekDate,
      highlights,
    })

    // 5. Generate PDF
    let pdfBuffer: Buffer
    try {
      pdfBuffer = await generateWeeklyReportPdf({
        companyName,
        weekDate,
        report,
        highlights,
      })
    } catch (pdfErr: any) {
      console.error('[send-email] PDF generation failed:', pdfErr?.message)
      // Send email without PDF if generation fails
      pdfBuffer = null as any
    }

    // 6. Send via Resend
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const resend = new Resend(resendKey)

    const emailPayload: any = {
      from: 'North Star Radar <support@nsradar.co.il>',
      replyTo: 'support@nsradar.co.il',
      to: user.email,
      subject: `הדוח השבועי שלך מ-North Star Radar | ${weekDate}`,
      html: emailHtml,
      text: emailPlainText,
      headers: {
        'List-Unsubscribe': '<mailto:support@nsradar.co.il?subject=unsubscribe>, <https://www.nsradar.co.il/unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `weekly-report-${user.id}-${Date.now()}`,
      },
      tags: [
        { name: 'category', value: 'weekly-report' },
        { name: 'env', value: process.env.NODE_ENV || 'production' },
      ],
    }

    if (pdfBuffer) {
      emailPayload.attachments = [{
        filename: `North-Star-Radar-Weekly-Report-${new Date().toISOString().split('T')[0]}.pdf`,
        content: pdfBuffer,
      }]
    }

    const { data, error } = await resend.emails.send(emailPayload)

    if (error) {
      console.error('[send-email] Resend error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[send-email] Report sent to ${user.email}, emailId=${data?.id}`)
    return NextResponse.json({ success: true, emailId: data?.id, sentTo: user.email })
  } catch (err: any) {
    console.error('[send-email] Error:', err?.message)
    return NextResponse.json({ error: err?.message || 'שגיאה בשליחת הדוח' }, { status: 500 })
  }
}
