import { impact } from '../data/profile'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSite } from '../context/site'
import PageHead from '../components/PageHead'
import ImpactRow from '../components/ImpactRow'
import RoleAccordion from '../components/RoleAccordion'
import RevealHeading from '../components/RevealHeading'
import NextPage from '../components/NextPage'

export default function ExperiencePage() {
  const { reduced } = useSite()
  usePageMeta(
    'Experience',
    'Senior Frontend Developer at KredX, previously Software Engineer and Senior Software Engineer at Paytm Money. Results, roles and education.',
  )
  return (
    <>
      <PageHead
        title="Experience"
        intro="Senior Frontend Developer at KredX since 2025. Before that, three years at Paytm Money in Pune."
      />

      <section className="sec sec-tight" aria-labelledby="impact-title">
        <div className="section-head">
          <RevealHeading id="impact-title" text="Before and after" />
          <p>Results from work I led or shipped.</p>
        </div>
        <ol className="impact">
          {impact.map((item) => (
            <ImpactRow key={item.what} item={item} reduced={reduced} />
          ))}
        </ol>
      </section>

      <section className="sec" aria-labelledby="roles-title">
        <div className="section-head">
          <RevealHeading id="roles-title" text="Roles" />
          <p>Every role in full. Open one to read what I shipped there.</p>
        </div>
        <RoleAccordion />
      </section>

      <div className="sec sec-tight">
        <NextPage to="/projects" hint="Next" label="Projects" />
      </div>
    </>
  )
}
