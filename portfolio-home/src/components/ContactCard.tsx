import { GITHUB_URL } from '../data/projects'
import { LINKEDIN_URL } from '../data/profile'
import { useMagnetic } from '../hooks/motion'
import RevealHeading from './RevealHeading'
import Spot from './Spot'
import CopyEmail from './CopyEmail'

/** Email with a copy button, plus LinkedIn and GitHub. Used on Home and the Contact page. */
export default function ContactCard({ title = "Let's build something", id = 'contact-title' }: { title?: string; id?: string }) {
  const cta = useMagnetic<HTMLAnchorElement>(0.35)
  return (
    <Spot className="contact-card">
      <RevealHeading id={id} text={title} />
      <p className="contact-intro">Email is the quickest way to reach me. I'm also on LinkedIn and GitHub.</p>
      <CopyEmail />
      <div className="contact-actions">
        <a ref={cta} className="btn btn-primary" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
          Connect on LinkedIn
        </a>
        <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>
    </Spot>
  )
}
