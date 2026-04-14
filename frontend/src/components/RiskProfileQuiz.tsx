import { useState } from 'react'
import type { RiskProfile } from '../lib/api'
import '../styles/components/RiskProfileQuiz.css'

type QuizAnswer = 'a' | 'b' | 'c'

type Question = {
  id: number
  text: string
  options: { value: QuizAnswer; label: string }[]
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    text: 'If your portfolio dropped 20% in a month, what would you most likely do?',
    options: [
      { value: 'a', label: 'Reduce my exposure to limit further losses' },
      { value: 'b', label: 'Hold steady and wait for a recovery' },
      { value: 'c', label: 'Buy more while prices are lower' },
    ],
  },
  {
    id: 2,
    text: "What's your main goal when tracking markets?",
    options: [
      { value: 'a', label: 'Protect what I have — stability matters most to me' },
      { value: 'b', label: 'Grow steadily over time with manageable ups and downs' },
      { value: 'c', label: 'Maximise growth, even if it means bigger swings' },
    ],
  },
  {
    id: 3,
    text: 'Which types of assets interest you most?',
    options: [
      { value: 'a', label: 'Stable blue-chip stocks and broad-market ETFs' },
      { value: 'b', label: 'A balanced mix of growth stocks and ETFs' },
      { value: 'c', label: 'Crypto, high-growth stocks, and emerging markets' },
    ],
  },
  {
    id: 4,
    text: 'How long do you typically plan to hold investments?',
    options: [
      { value: 'a', label: 'Under a year — I prefer shorter horizons' },
      { value: 'b', label: '1 to 5 years' },
      { value: 'c', label: '5 or more years — I think long-term' },
    ],
  },
]

const SCORE_MAP: Record<QuizAnswer, number> = { a: 1, b: 2, c: 3 }

function scoreToProfile(score: number): RiskProfile {
  if (score <= 6) return 'conservative'
  if (score <= 9) return 'moderate'
  return 'aggressive'
}

const PROFILE_LABELS: Record<RiskProfile, string> = {
  conservative: 'Conservative',
  moderate: 'Moderate',
  aggressive: 'Aggressive',
}

const PROFILE_TAGLINES: Record<RiskProfile, string> = {
  conservative:
    "You favour stability over big swings. We'll surface lower-volatility opportunities and flag assets that may carry more risk than your profile suggests.",
  moderate:
    "You balance growth with caution. We'll give you well-rounded insights and highlight when something pushes beyond a typical balanced approach.",
  aggressive:
    "You're comfortable with volatility in pursuit of higher returns. We'll surface high-momentum instruments while keeping you informed of the risks involved.",
}

const PROFILE_PILL: Record<RiskProfile, string> = {
  conservative: 'positive-pill',
  moderate: 'neutral-pill',
  aggressive: 'warning-pill',
}

function shuffleQuestions(questions: Question[]): Question[] {
  const arr = [...questions]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

type RiskProfileQuizProps = {
  isSaving?: boolean
  onComplete: (profile: RiskProfile) => Promise<void>
  onDismiss?: () => void
}

export function RiskProfileQuiz({ isSaving, onComplete, onDismiss }: RiskProfileQuizProps) {
  const [questions] = useState<Question[]>(() => shuffleQuestions(QUESTIONS))
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({})
  const [step, setStep] = useState<'quiz' | 'result'>('quiz')
  const [result, setResult] = useState<RiskProfile | null>(null)
  const [error, setError] = useState('')

  const currentQuestionIndex = Object.keys(answers).length
  const allAnswered = currentQuestionIndex >= questions.length
  const currentQuestion = allAnswered ? null : questions[currentQuestionIndex]

  function handleAnswer(answer: QuizAnswer) {
    const qId = questions[currentQuestionIndex].id
    const next = { ...answers, [qId]: answer }
    setAnswers(next)

    if (Object.keys(next).length >= questions.length) {
      const total = Object.values(next).reduce((sum, a) => sum + SCORE_MAP[a], 0)
      setResult(scoreToProfile(total))
      setStep('result')
    }
  }

  async function handleSave() {
    if (!result) return
    setError('')
    try {
      await onComplete(result)
    } catch {
      setError('Unable to save your profile. Please try again.')
    }
  }

  function handleRetake() {
    setAnswers({})
    setStep('quiz')
    setResult(null)
    setError('')
  }

  if (step === 'result' && result) {
    return (
      <div className="rq-card">
        <div className="rq-result-header">
          <span className={`rq-profile-pill ${PROFILE_PILL[result]}`}>
            {PROFILE_LABELS[result]} investor
          </span>
        </div>
        <p className="rq-result-tagline">{PROFILE_TAGLINES[result]}</p>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="rq-result-actions">
          <button
            className="primary-action"
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? 'Saving...' : 'Save my profile'}
          </button>
          <button className="ghost-action" onClick={handleRetake} type="button">
            Retake
          </button>
          {onDismiss ? (
            <button className="rq-skip-btn" onClick={onDismiss} type="button">
              Skip for now
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!currentQuestion) return null

  const progress = (currentQuestionIndex / questions.length) * 100

  return (
    <div className="rq-card">
      <div className="rq-progress-bar">
        <div className="rq-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="rq-step-label">
        Question {currentQuestionIndex + 1} of {questions.length}
      </p>
      <p className="rq-question">{currentQuestion.text}</p>
      <div className="rq-options">
        {currentQuestion.options.map((option) => (
          <button
            className="rq-option"
            key={option.value}
            onClick={() => handleAnswer(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {onDismiss && currentQuestionIndex === 0 ? (
        <button className="rq-skip-btn" onClick={onDismiss} type="button">
          Skip for now
        </button>
      ) : null}
    </div>
  )
}

// Compact badge shown when profile is already set
type RiskProfileBadgeProps = {
  profile: RiskProfile
  onRetake?: () => void
}

export function RiskProfileBadge({ profile, onRetake }: RiskProfileBadgeProps) {
  return (
    <div className="rq-badge-row">
      <span className={PROFILE_PILL[profile]}>{PROFILE_LABELS[profile]} investor</span>
      <p className="rq-badge-tagline">{PROFILE_TAGLINES[profile]}</p>
      {onRetake ? (
        <button className="rq-retake-link" onClick={onRetake} type="button">
          Retake quiz
        </button>
      ) : null}
    </div>
  )
}
