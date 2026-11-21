import { about, skills } from '../data/profile'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSite } from '../context/site'
import PageHead from '../components/PageHead'
import ScrollWords from '../components/ScrollWords'
import Spot from '../components/Spot'
import Journey from '../components/Journey'
import Marquee from '../components/Marquee'
import RevealHeading from '../components/RevealHeading'
import NextPage from '../components/NextPage'

export default function About() {
  const { reduced } = useSite()
  usePageMeta('About', 'Who Chinmay Upare is, how he works, his path from Pune to Bangalore, and the tools he uses.')
  const words = skills.flatMap((g) => g.items)
  const half = Math.ceil(words.length / 2)

  return (
    <>
      <PageHead title="About me" intro="Senior frontend developer, four years in fintech, and a habit of building small apps on the side." />

      <section className="sec sec-tight" aria-label="Introduction">
        <div className="about-grid">
          <ScrollWords className="about-lead" text={about.lead} reduced={reduced} />
          <div className="about-body">
            {about.body.map((para) => (
              <p key={para.slice(0, 24)}>{para}</p>
            ))}
          </div>
        </div>
        <ul className="principles">
          {about.principles.map((pr) => (
            <Spot as="li" key={pr.title}>
              <h3>{pr.title}</h3>
              <p>{pr.text}</p>
            </Spot>
          ))}
        </ul>
      </section>

      <Journey reduced={reduced} />

      <section className="sec stack" aria-labelledby="skills-title">
        <div className="section-head">
          <RevealHeading id="skills-title" text="What I work with" />
          <p>Day-job tooling and the stack behind my side projects.</p>
        </div>
        <Marquee items={words.slice(0, half)} />
        <Marquee items={words.slice(half)} reverse />
        <dl className="skill-groups">
          {skills.map((g) => (
            <Spot key={g.group}>
              <dt>{g.group}</dt>
              <dd>
                <ul>
                  {g.items.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </dd>
            </Spot>
          ))}
        </dl>
      </section>

      <div className="sec sec-tight">
        <NextPage to="/experience" hint="Next" label="Experience" />
      </div>
    </>
  )
}
