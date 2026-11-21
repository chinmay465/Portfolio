import { useState } from 'react'
import { education, jobs } from '../data/profile'

/** Every role in full, one open at a time, with an animated expand. */
export default function RoleAccordion() {
  const roles = jobs.flatMap((job) => job.roles.map((role) => ({ ...role, company: job.company, place: job.place })))
  const [open, setOpen] = useState(0)

  return (
    <div className="exp">
      {roles.map((r, i) => {
        const isOpen = open === i
        return (
          <div key={r.title + r.company} className={`exp-item${isOpen ? ' open' : ''}`}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`exp-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <span className="exp-company">{r.company}</span>
                <span className="exp-title">{r.title}</span>
                <span className="exp-dates">{r.dates}</span>
                <span className="exp-toggle" aria-hidden="true" />
              </button>
            </h3>
            <div id={`exp-${i}`} className="exp-panel" role="region" aria-label={`${r.title} at ${r.company}`}>
              <div>
                <p className="exp-place">{r.place}</p>
                <ul>
                  {r.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )
      })}
      <div className="exp-item exp-edu">
        <div className="exp-static">
          <span className="exp-company">Education</span>
          <span className="exp-title">
            {education.degree}, {education.school}
          </span>
          <span className="exp-dates">
            {education.dates}, {education.grade}
          </span>
        </div>
      </div>
    </div>
  )
}
