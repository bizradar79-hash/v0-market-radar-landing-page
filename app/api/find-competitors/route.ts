import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { companyName, industry } = await request.json()

    // Simulated competitor discovery based on industry
    // In production, this would call an AI service or web scraping API
    const competitorsByIndustry: Record<string, Array<{ name: string; website: string }>> = {
      "טכנולוגיה": [
        { name: "TechVision Israel", website: "https://techvision.co.il" },
        { name: "InnovateTech", website: "https://innovatetech.io" },
        { name: "Digital Solutions Ltd", website: "https://digitalsolutions.co.il" },
      ],
      "פינטק": [
        { name: "PayTech Israel", website: "https://paytech.co.il" },
        { name: "FinanceAI", website: "https://financeai.io" },
        { name: "SmartPay Solutions", website: "https://smartpay.co.il" },
      ],
      "סייבר": [
        { name: "CyberShield", website: "https://cybershield.co.il" },
        { name: "SecureNet Israel", website: "https://securenet.io" },
        { name: "DefenseTech", website: "https://defensetech.co.il" },
      ],
      "בריאות דיגיטלית": [
        { name: "HealthTech IL", website: "https://healthtech.co.il" },
        { name: "MedAI Solutions", website: "https://medai.io" },
        { name: "Digital Health Pro", website: "https://dhpro.co.il" },
      ],
      "מסחר אלקטרוני": [
        { name: "eCommerce Plus", website: "https://ecommerceplus.co.il" },
        { name: "ShopSmart Israel", website: "https://shopsmart.io" },
        { name: "OnlineRetail Pro", website: "https://onlineretail.co.il" },
      ],
      "SaaS": [
        { name: "CloudSoft Israel", website: "https://cloudsoft.co.il" },
        { name: "SaaSPro", website: "https://saaspro.io" },
        { name: "AppCloud Solutions", website: "https://appcloud.co.il" },
      ],
      "תוכנה": [
        { name: "SoftDev Israel", website: "https://softdev.co.il" },
        { name: "CodeMasters", website: "https://codemasters.io" },
        { name: "DevPro Solutions", website: "https://devpro.co.il" },
      ],
      "שירותים עסקיים": [
        { name: "BizServices IL", website: "https://bizservices.co.il" },
        { name: "ProBusiness", website: "https://probusiness.io" },
        { name: "Enterprise Solutions", website: "https://enterprise.co.il" },
      ],
    }

    // Get competitors for the industry or return generic ones
    const competitors = competitorsByIndustry[industry] || [
      { name: "Competitor A", website: "https://competitor-a.com" },
      { name: "Competitor B", website: "https://competitor-b.com" },
      { name: "Competitor C", website: "https://competitor-c.com" },
    ]

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    return NextResponse.json({
      success: true,
      companyName,
      competitors,
    })
  } catch (error) {
    console.error("Error finding competitors:", error)
    return NextResponse.json(
      { success: false, error: "Failed to find competitors" },
      { status: 500 }
    )
  }
}
