'use client'
import { useEffect } from 'react'

export function AccessibilityWidget() {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://acsbapp.com/apps/app/dist/js/app.js'
    script.async = true
    script.onload = () => {
      ;(window as any).acsbJS?.init({
        statementLink: '/accessibility',
        feedbackLink: 'mailto:support@nsradar.co.il',
        footerHtml: '',
        hideMobile: false,
        hideTrigger: false,
        language: 'he',
        position: 'left',
        leadColor: '#146FF8',
        triggerColor: '#146FF8',
        triggerRadius: '50%',
        triggerPositionX: 'left',
        triggerPositionY: 'bottom',
        triggerIcon: 'people',
        triggerSize: 'medium',
        triggerOffsetX: 20,
        triggerOffsetY: 20,
        mobile: {
          triggerSize: 'small',
          triggerPositionX: 'left',
          triggerPositionY: 'bottom',
          triggerOffsetX: 10,
          triggerOffsetY: 10,
        },
      })
    }
    document.body.appendChild(script)
  }, [])
  return null
}
