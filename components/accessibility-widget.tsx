'use client'
import { useState, useEffect } from 'react'

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false)
  const [fontSize, setFontSize] = useState(0)       // 0=normal, 1=large, 2=xlarge
  const [contrast, setContrast] = useState(false)
  const [highlight, setHighlight] = useState(false)
  const [noAnim, setNoAnim] = useState(false)
  // Hide ONLY in the embedded landing preview (?embed=1 / framed). On every real
  // page — including the full /r/* report opened in its own tab — it stays.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => {
    setEmbedded(
      new URLSearchParams(window.location.search).get('embed') === '1'
        || window.self !== window.top,
    )
  }, [])

  // Apply / remove CSS classes on <html>
  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('a11y-contrast', contrast)
    html.classList.toggle('a11y-highlight-links', highlight)
    html.classList.toggle('a11y-no-anim', noAnim)
    html.classList.remove('a11y-font-large', 'a11y-font-xlarge')
    if (fontSize === 1) html.classList.add('a11y-font-large')
    if (fontSize === 2) html.classList.add('a11y-font-xlarge')
  }, [fontSize, contrast, highlight, noAnim])

  // Inject global CSS once
  useEffect(() => {
    if (document.getElementById('a11y-styles')) return
    const style = document.createElement('style')
    style.id = 'a11y-styles'
    style.textContent = `
      .a11y-font-large  { font-size: 110% !important; }
      .a11y-font-xlarge { font-size: 125% !important; }
      .a11y-contrast, .a11y-contrast * {
        background: #000 !important;
        color: #ff0 !important;
        border-color: #ff0 !important;
      }
      .a11y-highlight-links a {
        outline: 3px solid #f60 !important;
        text-decoration: underline !important;
      }
      .a11y-no-anim *, .a11y-no-anim *::before, .a11y-no-anim *::after {
        animation: none !important;
        transition: none !important;
      }
    `
    document.head.appendChild(style)
  }, [])

  function reset() {
    setFontSize(0)
    setContrast(false)
    setHighlight(false)
    setNoAnim(false)
  }

  if (embedded) return null

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="פתח תפריט נגישות"
        aria-expanded={open}
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          zIndex: 9999,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#1876c9',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        }}
      >
        ♿
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="תפריט נגישות"
          dir="rtl"
          style={{
            position: 'fixed',
            bottom: 78,
            left: 20,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 12,
            padding: '16px',
            width: 220,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>נגישות</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="סגור תפריט נגישות"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666', padding: 2 }}
            >✕</button>
          </div>

          {/* Font size */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 6, fontWeight: 600 }}>גודל טקסט</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { label: 'רגיל', val: 0 },
                { label: 'גדול', val: 1 },
                { label: 'גדול מאוד', val: 2 },
              ].map(({ label, val }) => (
                <button
                  key={val}
                  onClick={() => setFontSize(val)}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    padding: '4px 2px',
                    border: '1px solid',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: fontSize === val ? '#1876c9' : '#f5f5f5',
                    color: fontSize === val ? '#fff' : '#333',
                    borderColor: fontSize === val ? '#1876c9' : '#ccc',
                  }}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          {[
            { label: 'ניגודיות גבוהה', state: contrast, toggle: () => setContrast(v => !v) },
            { label: 'הדגש קישורים', state: highlight, toggle: () => setHighlight(v => !v) },
            { label: 'עצור אנימציות', state: noAnim, toggle: () => setNoAnim(v => !v) },
          ].map(({ label, state, toggle }) => (
            <button
              key={label}
              onClick={toggle}
              role="switch"
              aria-checked={state}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: state ? '#e8f0fe' : '#f9f9f9',
                border: `1px solid ${state ? '#1876c9' : '#ddd'}`,
                borderRadius: 8,
                padding: '7px 10px',
                marginBottom: 6,
                cursor: 'pointer',
                fontSize: 13,
                color: state ? '#1876c9' : '#333',
                fontWeight: state ? 600 : 400,
              }}
            >
              <span>{label}</span>
              <span style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                background: state ? '#1876c9' : '#ccc',
                position: 'relative',
                display: 'inline-block',
                flexShrink: 0,
              }}>
                <span style={{
                  position: 'absolute',
                  top: 2,
                  left: state ? 2 : 14,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.15s',
                }} />
              </span>
            </button>
          ))}

          {/* Reset + statement */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee' }}>
            <button
              onClick={reset}
              style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >איפוס</button>
            <a
              href="/accessibility"
              style={{ fontSize: 12, color: '#1876c9', textDecoration: 'underline' }}
            >הצהרת נגישות</a>
          </div>
        </div>
      )}
    </>
  )
}
