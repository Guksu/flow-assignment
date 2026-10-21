import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useAsyncAction } from './useAsyncAction'
import './loading-button.css'

type LoadingButtonProps = {
  children: ReactNode
  /** 누르면 실행할 비동기 작업 — 성공하면 완료 표시, 예외를 던지면 실패 표시 */
  onAction: () => Promise<unknown>
  loadingLabel?: string
  successLabel?: string
  errorLabel?: string
  minLoadingMs?: number
  successHoldMs?: number
  errorHoldMs?: number
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>

const CheckIcon = () => (
  <svg className="loading-button-check" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * 제출 버튼 — 진행 상태를 버튼 자신이 보여준다.
 * 상태 판정·중복 차단은 useAsyncAction이, 모습 전환은 CSS가 담당한다.
 *
 * 스크린 리더 대응 두 가지가 들어 있다:
 *  - 상태 레이어(진행·완료·실패)는 항상 aria-hidden — 버튼 이름은 언제나 "주문하기"로 고정된다.
 *    상태에 따라 이름이 "전송 중"으로 바뀌면 무슨 버튼이었는지 알 수 없게 된다.
 *  - 그 대신 role=status 영역이 상태 변화를 소리로 전한다(진행 중·완료·실패)
 */
export const LoadingButton = ({
  children,
  onAction,
  loadingLabel = '전송 중',
  successLabel = '완료',
  errorLabel = '실패',
  minLoadingMs,
  successHoldMs,
  errorHoldMs,
  className,
  ...buttonProps
}: LoadingButtonProps) => {
  const action = useAsyncAction({ minLoadingMs, successHoldMs, errorHoldMs })

  const announcement =
    action.status === 'loading' ? loadingLabel : action.status === 'success' ? successLabel : action.status === 'error' ? errorLabel : ''

  return (
    <>
      <button
        type="button"
        {...buttonProps}
        className={className ? `loading-button ${className}` : 'loading-button'}
        data-status={action.status}
        aria-disabled={action.isBusy}
        onClick={() => {
          void action.run(onAction)
        }}
      >
        <span className="loading-button-layer" data-layer="idle">
          {children}
        </span>
        <span className="loading-button-layer" data-layer="loading" aria-hidden="true">
          <span className="loading-button-spinner" />
          {loadingLabel}
        </span>
        <span className="loading-button-layer" data-layer="success" aria-hidden="true">
          <CheckIcon />
          {successLabel}
        </span>
        <span className="loading-button-layer" data-layer="error" aria-hidden="true">
          {errorLabel}
        </span>
      </button>
      <span className="loading-button-live" role="status">
        {announcement}
      </span>
    </>
  )
}
