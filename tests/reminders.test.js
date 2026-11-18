import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localWall,
  addDays,
  medActiveOn,
  dueDoses,
  doseStatusSrv,
  missed3Count,
} from '../supabase/functions/send-reminders/reminders.js';

test('localWall converts UTC timestamp to Tashkent (UTC+5, tzOffsetMin = -300)', () => {
  // 2026-11-18T03:30:00Z -> 08:30 in Tashkent (510 minutes)
  const utcMs = Date.UTC(2026, 10, 18, 3, 30, 0);
  const res = localWall(utcMs, -300);
  assert.equal(res.date, '2026-11-18');
  assert.equal(res.minutes, 8 * 60 + 30);
});

test('addDays accurately shifts calendar dates across month boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('medActiveOn respects startDate and durationDays', () => {
  const med = { id: 'm1', name: 'Amoxicillin', startDate: '2026-11-10', durationDays: 5 };
  assert.equal(medActiveOn(med, '2026-11-09'), false);
  assert.equal(medActiveOn(med, '2026-11-10'), true);
  assert.equal(medActiveOn(med, '2026-11-14'), true);
  assert.equal(medActiveOn(med, '2026-11-15'), false);
});

test('dueDoses returns untaken, unpushed doses within the 10-minute window', () => {
  const rx = {
    medicines: [
      { id: 'm1', name: 'Enalapril', dosage: '10 mg', times: ['08:00', '20:00'], startDate: '2026-11-01' },
      { id: 'm2', name: 'Aspirin', dosage: '75 mg', times: ['08:05'], startDate: '2026-11-01' },
    ],
  };
  const todayLog = ['m2__08:05']; // already taken
  const pushedToday = [];
  const due = dueDoses(rx, todayLog, pushedToday, '2026-11-18', 8 * 60 + 6);
  assert.equal(due.length, 1);
  assert.equal(due[0].key, 'm1__08:00');
});

test('doseStatusSrv classifies taken, upcoming, due, and missed doses', () => {
  assert.equal(doseStatusSrv('2026-11-18', '08:00', true, '2026-11-18', 600), 'taken');
  assert.equal(doseStatusSrv('2026-11-18', '12:00', false, '2026-11-18', 600), 'upcoming');
  assert.equal(doseStatusSrv('2026-11-18', '09:30', false, '2026-11-18', 600), 'due');
  assert.equal(doseStatusSrv('2026-11-18', '08:00', false, '2026-11-18', 600), 'missed');
});

test('missed3Count counts missed doses across the last 3 days', () => {
  const rx = {
    medicines: [
      { id: 'm1', name: 'Metformin', times: ['08:00', '20:00'], startDate: '2026-11-01' },
    ],
  };
  const logsByDate = {
    '2026-11-18': ['m1__08:00'], // 08:00 taken, 20:00 upcoming at 10:00
    '2026-11-17': ['m1__08:00'], // 20:00 missed (1)
    '2026-11-16': [],            // both 08:00 and 20:00 missed (2)
  };
  const missed = missed3Count(rx, logsByDate, '2026-11-18', 10 * 60);
  assert.equal(missed, 3);
});
