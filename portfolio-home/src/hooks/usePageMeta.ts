import { useEffect } from 'react'

const SITE = 'Chinmay Upare'

/** Sets the tab title and meta description for the current route. */
export function usePageMeta(title: string | null, description: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : `${SITE}, senior frontend developer`
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.content = description
  }, [title, description])
}
