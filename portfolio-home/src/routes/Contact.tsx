import { EMAIL } from '../data/profile'
import { usePageMeta } from '../hooks/usePageMeta'
import PageHead from '../components/PageHead'
import ContactCard from '../components/ContactCard'

export default function Contact() {
  usePageMeta('Contact', `Reach Chinmay Upare by email at ${EMAIL}, on LinkedIn or on GitHub.`)
  return (
    <>
      <PageHead title="Contact" intro="Based in Bangalore. Happy to talk about frontend roles, design systems or any of my projects." />
      <section className="sec sec-tight" aria-labelledby="contact-title">
        <ContactCard title="Say hello" />
      </section>
    </>
  )
}
