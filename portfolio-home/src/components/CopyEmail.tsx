import { useState } from 'react'
import { EMAIL } from '../data/profile'

/** The address as text and a copy button: mailto links fail silently for many people. */
export default function CopyEmail() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="email">
      <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      <button type="button" onClick={copy} aria-live="polite">
        {copied ? 'Copied' : 'Copy address'}
      </button>
    </div>
  )
}
