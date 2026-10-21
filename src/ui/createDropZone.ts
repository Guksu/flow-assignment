/**
 * 프레임워크 무관 파일 끌어다 놓기 코어 (의존성 0).
 *
 * 브라우저의 기본 동작이 방해가 되는 드문 경우다. 두 가지를 반드시 막아야 한다:
 *  1. dragover에서 preventDefault를 하지 않으면 **drop 이벤트가 아예 오지 않는다**
 *  2. 영역 바깥에 파일을 놓으면 브라우저가 그 파일을 탭에 열어 버려 작업 중이던 화면이 사라진다
 *
 * 그리고 dragenter/dragleave는 자식 요소를 넘나들 때마다 발생한다 — 그대로 쓰면
 * 영역 안에서 마우스를 움직이는 동안 테두리가 깜빡인다. 그래서 들어온 횟수를 센다.
 */

type CreateDropZoneOptions = {
  /** 파일을 받을 영역 */
  zone: HTMLElement
  /** 파일이 놓였을 때 — 검증은 호출하는 쪽(validateFiles)에서 한다 */
  onDrop: (files: File[]) => void
  /** 영역 위에 파일이 올라와 있는지 — 테두리 강조에 쓴다 */
  onDragStateChange?: (dragging: boolean) => void
  /**
   * 영역 밖에 놓았을 때 브라우저가 파일을 여는 것을 막을지 (기본 true).
   * 작성 중이던 화면이 통째로 날아가는 사고를 막는다.
   */
  blockWindowDrop?: boolean
}

export const createDropZone = ({ zone, onDrop, onDragStateChange, blockWindowDrop = true }: CreateDropZoneOptions) => {
  // 자식 위를 지날 때도 enter/leave가 오므로, 깊이를 세어 0이 될 때만 벗어난 것으로 본다
  let depth = 0

  const setDragging = (dragging: boolean) => {
    zone.dataset.dragging = dragging ? 'true' : 'false'
    onDragStateChange?.(dragging)
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    depth += 1
    if (depth === 1) setDragging(true)
  }

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault() // 이게 없으면 drop이 오지 않는다
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy' // 커서를 "복사"로
  }

  const onDragLeave = () => {
    depth = Math.max(0, depth - 1)
    if (depth === 0) setDragging(false)
  }

  const onDropFiles = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    depth = 0
    setDragging(false)
    onDrop(Array.from(event.dataTransfer?.files ?? []))
  }

  /** 영역 밖에 놓은 파일을 브라우저가 열지 못하게 */
  const swallow = (event: DragEvent) => {
    if (!hasFiles(event) || zone.contains(event.target as Node)) return
    event.preventDefault()
    if (event.type === 'drop' && event.dataTransfer) event.dataTransfer.dropEffect = 'none'
  }

  setDragging(false)
  zone.addEventListener('dragenter', onDragEnter)
  zone.addEventListener('dragover', onDragOver)
  zone.addEventListener('dragleave', onDragLeave)
  zone.addEventListener('drop', onDropFiles)
  if (blockWindowDrop) {
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
  }

  return {
    destroy: () => {
      zone.removeEventListener('dragenter', onDragEnter)
      zone.removeEventListener('dragover', onDragOver)
      zone.removeEventListener('dragleave', onDragLeave)
      zone.removeEventListener('drop', onDropFiles)
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    },
  }
}
