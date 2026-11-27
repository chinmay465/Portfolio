import { Link } from 'react-router'
import { projects } from '../data/projects'
import { impact } from '../data/profile'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSite } from '../context/site'
import Hero from '../components/Hero'
import ProjectCard from '../components/ProjectCard'
import ImpactRow from '../components/ImpactRow'
import RevealHeading from '../components/RevealHeading'
import ContactCard from '../components/ContactCard'
import AllProjectsCta from '../components/AllProjectsCta'

const FEATURED = ['rail', 'kavach', 'swar', 'ekatra'] as const

export default function Home() {
  const { reduced } = useSite()
  usePageMeta(
    null,
    'Chinmay Upare, senior frontend developer at KredX. React, Next.js and TypeScript: design systems, micro-frontends, KYC and payments, plus eight side projects.',
  )
  const featured = FEATURED.map((id) => projects.find((p) => p.id === id)!)
  const highlights = impact.filter((i) => ['Company onboarding', 'Lighthouse score', 'Shared UI components'].includes(i.what))

  return (
    <>
      <Hero />

      <section className="sec" aria-labelledby="work-title">
        <div className="section-head">
          <RevealHeading id="work-title" text="Selected work" />
          <p>Side projects I designed and built end to end. Hover a card to play its preview.</p>
        </div>
        <div className="pgrid pgrid-4 rail-mobile">
          {featured.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
        <AllProjectsCta />
      </section>

      <section className="sec" aria-labelledby="hl-title">
        <div className="section-head">
          <RevealHeading id="hl-title" text="Before and after" />
          <p>
            A few results from work at KredX and Paytm Money.{' '}
            <Link to="/experience" viewTransition>
              Full experience
            </Link>
          </p>
        </div>
        <ol className="impact impact-3 rail-mobile">
          {highlights.map((item) => (
            <ImpactRow key={item.what} item={item} reduced={reduced} />
          ))}
        </ol>
      </section>

      <section className="sec" aria-labelledby="contact-title">
        <ContactCard />
      </section>
    </>
  )
}
