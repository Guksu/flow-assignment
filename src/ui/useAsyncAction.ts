import { useEffect, useRef, useState } from 'react'
import { createAsyncAction, type AsyncActionController, type AsyncActionResult, type AsyncActionStatus } from './createAsyncAction'

type UseAsyncActionOptions = {
  minLoadingMs?: number
  successHoldMs?: number
  errorHoldMs?: number
}

/**
 * createAsyncAction 코어의 React 래퍼 — 상태 하나(status)와 실행 함수(run)를 준다.
 * 버튼 없이도 쓸 수 있다(폼 submit·아이콘 액션 등). 버튼 UI까지 필요하면 LoadingButton을 쓴다.
 */
export const useAsyncAction = (options: UseAsyncActionOptions = {}) => {
  const [status, setStatus] = useState<AsyncActionStatus>('idle')
  const optionsRef = useRef(options)
  // 렌더 중 ref 쓰기 금지 규칙 — 최신 옵션은 커밋 뒤에 옮긴다(실행은 클릭 뒤라 늘 최신을 본다)
  useEffect(() => {
    optionsRef.current = options
  })
  const controllerRef = useRef<AsyncActionController | null>(null)

  // 코어는 처음 쓸 때 만든다 — StrictMode의 이중 마운트로 파기돼도 다음 실행에서 되살아난다
  const controller = () => {
    if (!controllerRef.current) {
      controllerRef.current = createAsyncAction({ ...optionsRef.current, onChange: setStatus })
    }
    return controllerRef.current
  }

  useEffect(function destroyOnUnmount() {
    return () => {
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  return {
    status,
    isBusy: status === 'loading',
    run: <T,>(task: () => Promise<T>): Promise<AsyncActionResult<T>> => controller().run(task),
    reset: () => controller().reset(),
  }
}
