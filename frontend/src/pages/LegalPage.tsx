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
      <article className="panel legal-panel">
        <div className="legal-copy">
          <p className="section-label">{eyebrow}</p>
          <h1 className="login-card-title legal-title">{title}</h1>
          <p className="legal-summary">{summary}</p>
        </div>

        <div className="legal-sections">
          {sections.map((section) => (
            <section className="legal-section" key={section.title}>
              <h2 className="panel-title legal-section-title">{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </section>
  )
}
