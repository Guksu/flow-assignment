// 업로드 파일 저장소 (설계 2.3·2.5). 배포는 Vercel Blob 비공개 스토어, 로컬·테스트는 메모리.
import { del, put } from "@vercel/blob";

export interface FileStorage {
  put(pathname: string, body: Uint8Array): Promise<void>;
  remove(pathnames: string[]): Promise<void>;
}

// 재시작하면 사라진다. 로컬 실행과 테스트용 (설계 2.6 — 디스크 어댑터는 두지 않음)
export class MemoryStorage implements FileStorage {
  files = new Map<string, Uint8Array>();

  async put(pathname: string, body: Uint8Array) {
    this.files.set(pathname, body);
  }

  async remove(pathnames: string[]) {
    for (const pathname of pathnames) this.files.delete(pathname);
  }
}

export const memoryStorage = new MemoryStorage();

// 비공개 저장, 원래 이름 없는 경로, 형식은 클라이언트 값 대신 octet-stream으로 고정 (위험 U4·U5·N17)
export const blobStorage: FileStorage = {
  async put(pathname, body) {
    await put(pathname, Buffer.from(body), {
      access: "private",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  },
  async remove(pathnames) {
    if (pathnames.length > 0) await del(pathnames);
  },
};

// Vercel 위에서는 Blob만 쓴다. 저장소 설정이 빠졌으면 메모리로 조용히 넘어가지 않고 SDK 오류로 실패한다
export const getStorage = (): FileStorage => (process.env.VERCEL ? blobStorage : memoryStorage);
