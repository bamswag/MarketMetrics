import '../styles/pages/AuthPages.css'

type LegalSection = {
  title: string
  body: string
}

type LegalPageProps = {
  eyebrow: string
  summary: string
  title: string
  sections: LegalSection[]
}

export function LegalPage({ eyebrow, summary, title, sections }: LegalPageProps) {
  return (
    <section className="auth-page page-section legal-page">
      <article className="panel legal-panel" data-scroll-reveal="rise" data-scroll-tone="neutral">
        <div className="legal-copy" data-scroll-stagger>
          <p className="section-label" data-scroll-item>{eyebrow}</p>
          <h1 className="login-card-title legal-title" data-scroll-item>{title}</h1>
          <p className="legal-summary" data-scroll-item>{summary}</p>
        </div>

        <div className="legal-sections" data-scroll-stagger>
          {sections.map((section) => (
            <section className="legal-section" key={section.title} data-scroll-item>
              <h2 className="panel-title legal-section-title">{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </section>
  )
}
