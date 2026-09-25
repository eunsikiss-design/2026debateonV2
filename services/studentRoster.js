'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROSTER_PATH = process.env.STUDENT_ROSTER_PATH
  ? path.resolve(process.env.STUDENT_ROSTER_PATH)
  : path.join(__dirname, '..', 'data', 'student_roster.json');

const normalizeName = value => String(value || '').normalize('NFC').replace(/\s+/g, '').trim();

class StudentRoster {
  constructor(filePath = ROSTER_PATH) {
    this.filePath = filePath;
    this.students = [];
    this.byNumber = new Map();
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return;
    const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.students)) throw new Error('Invalid student roster');
    const seen = new Set();
    this.students = data.students.map(item => {
      const studentNumber = String(item.studentNumber || '').trim();
      if (!/^\d{5}$/.test(studentNumber) || seen.has(studentNumber)) throw new Error('Invalid or duplicate student number');
      seen.add(studentNumber);
      const name = item.name == null || !String(item.name).trim() ? null : String(item.name).normalize('NFC').trim();
      return { studentNumber, name, grade: Number(studentNumber[0]), classId: Number(studentNumber.slice(1,3)), seatNumber: Number(studentNumber.slice(3,5)) };
    });
    this.byNumber = new Map(this.students.map(item => [item.studentNumber, item]));
  }

  verify(studentNumber, submittedName) {
    const number = String(studentNumber || '').trim();
    const name = String(submittedName || '').normalize('NFC').trim();
    if (!/^\d{5}$/.test(number)) throw Object.assign(new Error('학번 5자리를 확인해 주세요.'), { status: 400, code: 'INVALID_STUDENT_NUMBER' });
    if (!/^[가-힣A-Za-z·ㆍ\s]{2,30}$/u.test(name)) throw Object.assign(new Error('학생 성명을 정확히 입력해 주세요.'), { status: 400, code: 'INVALID_STUDENT_NAME' });
    const entry = this.byNumber.get(number);
    if (!entry) throw Object.assign(new Error('등록된 학번이 아닙니다.'), { status: 404, code: 'STUDENT_NOT_IN_ROSTER' });
    if (entry.name && normalizeName(entry.name) !== normalizeName(name)) throw Object.assign(new Error('학번과 성명이 명단과 일치하지 않습니다.'), { status: 403, code: 'ROSTER_NAME_MISMATCH' });
    return { ...entry, verifiedName: entry.name || name, transferSlot: !entry.name };
  }

  registrationStatus(users = []) {
    const claimed = new Map(users.filter(user => user.role === 'student' && user.studentNumber).map(user => [String(user.studentNumber), user]));
    return this.students.map(entry => {
      const user = claimed.get(entry.studentNumber);
      return { studentNumber: entry.studentNumber, name: entry.name || user?.name || null, grade: entry.grade, classId: entry.classId,
        seatNumber: entry.seatNumber, transferSlot: !entry.name, registered: Boolean(user?.onboardingComplete),
        authProvider: user?.authProvider || null, email: user?.email || null, registeredAt: user?.registeredAt || null,
        consentAt: user?.privacyConsentAt || null, lastLoginAt: user?.lastLoginAt || null };
    });
  }
}

module.exports = new StudentRoster();
module.exports.StudentRoster = StudentRoster;
module.exports.normalizeName = normalizeName;
