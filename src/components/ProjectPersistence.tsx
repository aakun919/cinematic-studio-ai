// ProjectPersistence — プロジェクトの復元と自動保存 (Task 14)
//
// 起動時: IndexedDB から ProjectFile を読み、あれば RESTORE_PROJECT で
// 編集状態を復元する。無ければ PROJECT_RESTORE_DONE で復元完了とする。
// 復元が終わるまでは自動保存しない (初期モック状態で保存データを
// 上書きしてしまう事故を防ぐ)。
//
// 自動保存: 復元完了後、saveStatus が 'unsaved' になったら 1 秒デバウンスで
// ProjectFile を保存する。保存中に新たな編集があった場合は 'saved' に
// 戻さない (次のデバウンスで最新状態が保存される)。

import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store.ts';
import { projectStorage } from '../utils/projectStorage.ts';
import { serializeProject, projectToStateSlice } from '../utils/projectFile.ts';

const AUTOSAVE_DELAY_MS = 1000;

export function ProjectPersistence() {
  const { state, dispatch } = useEditorStore();
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const restoreStartedRef = useRef(false);

  // 起動時の復元 (一度だけ)
  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    let active = true;
    void (async () => {
      const file = await projectStorage.loadProject();
      if (!active) return;
      if (file) {
        dispatch({ type: 'RESTORE_PROJECT', slice: projectToStateSlice(file) });
      } else {
        dispatch({ type: 'PROJECT_RESTORE_DONE' });
      }
    })();
    return () => {
      active = false;
    };
  }, [dispatch]);

  // 自動保存 (デバウンス)
  const { projectRestored, saveStatus } = state;
  useEffect(() => {
    if (!projectRestored || saveStatus !== 'unsaved') return;
    const timer = setTimeout(() => {
      const snapshot = stateRef.current;
      if (snapshot.saveStatus !== 'unsaved') return;
      void (async () => {
        const ok = await projectStorage.saveProject(serializeProject(snapshot));
        if (ok && stateRef.current === snapshot) {
          dispatch({ type: 'SET_SAVE_STATUS', status: 'saved' });
        }
      })();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [projectRestored, saveStatus, state, dispatch]);

  return null;
}
