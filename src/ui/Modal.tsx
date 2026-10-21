import { useEffect, useEffectEvent, useRef, type MouseEvent, type ReactNode } from 'react'
import './modal-dialog.css'

type ModalProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** 스크린 리더가 읽을 제목 요소의 id (내용 안 h2에 같은 id를 붙인다) */
  labelledBy?: string
  /** 백드롭 클릭으로 닫기 허용 (기본 true — 파괴적 확인 모달이면 false) */
  dismissOnBackdrop?: boolean
  className?: string
}

/** 닫힘 애니메이션이 끝나지 않는 환경(animation 미지원·jsdom)을 위한 상한 */
const CLOSE_FALLBACK_MS = 500

/**
 * 네이티브 <dialog>.showModal() 기반 모달 — 포커스 트랩·배경 inert·Esc·포커스 복귀는 브라우저가 담당한다.
 * 이 컴포넌트가 더하는 것은 딱 하나: dialog.close()가 즉시 사라지는 문제를 data-closing 애니메이션 뒤로 미루는 것.
 * open 상태는 부모가 소유한다 — Esc·백드롭은 onClose를 부를 뿐 스스로 닫지 않는다.
 */
export const Modal = ({ open, onClose, children, labelledBy, dismissOnBackdrop = true, className }: ModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Esc 리스너는 한 번만 붙이고, 부를 때는 최신 onClose를 쓴다 (렌더 중 ref 쓰기 금지 규칙 때문에 useEffectEvent)
  const requestClose = useEffectEvent(() => onClose())

  useEffect(
    function syncOpenState() {
      const dialog = dialogRef.current
      if (!dialog) return

      if (open) {
        dialog.removeAttribute('data-closing')
        if (!dialog.open) dialog.showModal()
        return
      }
      if (!dialog.open) return

      // 닫힘: 애니메이션을 먼저 재생하고, 끝난 뒤에 실제로 닫는다
      let done = false
      const finish = () => {
        if (done) return
        done = true
        dialog.removeAttribute('data-closing')
        dialog.close()
      }
      dialog.setAttribute('data-closing', '')
      dialog.addEventListener('animationend', finish, { once: true })
      const timer = window.setTimeout(finish, CLOSE_FALLBACK_MS)
      return () => {
        dialog.removeEventListener('animationend', finish)
        window.clearTimeout(timer)
        // 닫히는 도중 다시 열리면 즉시 정리한다 — data-closing이 남으면 열림 애니메이션과 충돌
        if (!done) dialog.removeAttribute('data-closing')
      }
    },
    [open],
  )

  useEffect(function routeNativeCloseToParent() {
    const dialog = dialogRef.current
    if (!dialog) return
    // Esc — 브라우저가 즉시 close()하려는 것을 막고 부모에게 닫기를 요청한다(애니메이션 경유)
    const handleCancel = (event: Event) => {
      event.preventDefault()
      requestClose()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [])

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    // 패널 안쪽 클릭은 자식 요소가 target이고, ::backdrop 클릭만 dialog 자신이 target이다
    if (dismissOnBackdrop && event.target === event.currentTarget) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={className ? `modal ${className}` : 'modal'}
      aria-labelledby={labelledBy}
      onClick={handleBackdropClick}
    >
      <div className="modal-body">{children}</div>
    </dialog>
  )
}
