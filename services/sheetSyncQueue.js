/**
 * services/sheetSyncQueue.js
 * 
 * 구글 스프레드시트 비동기 동기화 큐 (Google Sheets Sync Queue)
 * - 개발지시서 제63조~제68조 준수
 * - 학생 연습 세션, 토론 관찰 메모, 뱃지 수여 내역, 세특 초안을 시트에 비동기 안전 적재
 * - 오프라인 탄력성(Offline Fault Tolerance): 장애 시 로컬 스토어 큐에 보관 후 재시도
 */

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, '..', 'data', 'syncQueue.json');

class SheetSyncQueue {
  constructor() {
    this.queue = this._loadQueue();
    this.isSyncing = false;
    this.syncHistory = [];
  }

  _loadQueue() {
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load sync queue, initializing empty queue:', e.message);
    }
    return [];
  }

  _saveQueue() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to persist sync queue:', e.message);
    }
  }

  // 큐에 동기화 작업 적재
  enqueue(actionType, payload) {
    const item = {
      queueId: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      actionType, // 'PRACTICE_SUBMIT' | 'AWARD_BADGE' | 'TEACHER_OBSERVATION' | 'DEBATE_EVALUATION' | 'SCHOOL_RECORD_DRAFT'
      payload,
      status: 'pending',
      retryCount: 0,
      enqueuedAt: new Date().toISOString()
    };
    this.queue.push(item);
    this._saveQueue();
    return item;
  }

  // 큐 플러시 (로컬 CSV 파일로 모의 동기화 기록)
  async flushQueue(targetSheetId = 'default_gangseo_sheet_2026') {
    return { success: false, error: 'SHEETS_NOT_CONNECTED', processedCount: 0,
      remainingCount: this.queue.length, message: 'Google Sheets 연결 전입니다. 대기 작업은 보존됩니다.' };
  }

  getQueueStatus() {
    return {
      pendingCount: this.queue.length,
      items: this.queue.slice(0, 10),
      recentSyncCount: this.syncHistory.length,
      lastSyncedAt: this.syncHistory[0]?.syncedAt || null
    };
  }
}

module.exports = new SheetSyncQueue();

