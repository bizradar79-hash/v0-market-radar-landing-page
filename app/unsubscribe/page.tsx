export const dynamic = 'force-dynamic'

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-4">ביטול הרשמה</h1>
        <p className="text-gray-600 text-sm leading-relaxed mb-6">
          להסרה מרשימת התפוצה צור קשר עם
        </p>
        <a
          href="mailto:support@nsradar.co.il?subject=unsubscribe"
          className="inline-block bg-teal-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-teal-700 transition-colors"
        >
          support@nsradar.co.il
        </a>
        <p className="text-xs text-gray-400 mt-6">
          North Star Radar | nsradar.co.il
        </p>
      </div>
    </div>
  )
}
