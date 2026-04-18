/**
 * Walk a FIT buffer and collect workout + workout_step messages (fit-file-parser's default
 * parser overwrites repeated `workout_step` in a single key). Header / CRC logic derived from
 * fit-file-parser (MIT) — see node_modules/fit-file-parser/dist/fit-parser.js
 */

import { readRecord, getArrayBuffer, calculateCRC } from 'fit-file-parser-binary';

const parserOptions = {
  force: true,
  speedUnit: 'm/s',
  lengthUnit: 'm',
  temperatureUnit: 'celsius',
  elapsedRecordField: false,
  pressureUnit: 'bar',
  mode: 'list',
};

/**
 * @param {ArrayBuffer|Uint8Array|Buffer} content
 * @returns {{ workout: object|null, workoutSteps: object[], fileIds: object[], error?: string }}
 */
export function extractWorkoutStepsFromFitBuffer(content) {
  const blob = new Uint8Array(getArrayBuffer(content));
  if (blob.length < 12) {
    return { workout: null, workoutSteps: [], fileIds: [], error: 'File too small to be a FIT file.' };
  }

  const headerLength = blob[0];
  if (headerLength !== 14 && headerLength !== 12) {
    return { workout: null, workoutSteps: [], fileIds: [], error: 'Invalid FIT header size.' };
  }

  let fileTypeString = '';
  for (let i = 8; i < 12; i++) {
    fileTypeString += String.fromCharCode(blob[i]);
  }
  if (fileTypeString !== '.FIT') {
    return { workout: null, workoutSteps: [], fileIds: [], error: "Missing '.FIT' signature — not a FIT file." };
  }

  if (headerLength === 14) {
    const crcHeader = blob[12] + (blob[13] << 8);
    const crcHeaderCalc = calculateCRC(blob, 0, 12);
    if (crcHeader !== crcHeaderCalc && !parserOptions.force) {
      return { workout: null, workoutSteps: [], fileIds: [], error: 'FIT header CRC mismatch.' };
    }
  }

  const dataLength = blob[4] + (blob[5] << 8) + (blob[6] << 16) + (blob[7] << 24);
  const crcStart = dataLength + headerLength;
  if (crcStart + 2 > blob.length) {
    return { workout: null, workoutSteps: [], fileIds: [], error: 'FIT file truncated.' };
  }

  const crcFile = blob[crcStart] + (blob[crcStart + 1] << 8);
  const crcFileCalc = calculateCRC(blob, headerLength === 12 ? 0 : headerLength, crcStart);
  if (crcFile !== crcFileCalc && !parserOptions.force) {
    return { workout: null, workoutSteps: [], fileIds: [], error: 'FIT data CRC mismatch.' };
  }

  let loopIndex = headerLength;
  const messageTypes = [];
  const developerFields = [];
  let startDate;
  let lastStopTimestamp;
  let pausedTime = 0;

  const sessions = [];
  const laps = [];
  const records = [];
  const events = [];
  const hr_zone = [];
  const power_zone = [];
  const hrv = [];
  const device_infos = [];
  const applications = [];
  const fieldDescriptions = [];
  const dive_gases = [];
  const course_points = [];
  const sports = [];
  const monitors = [];
  const stress = [];
  const definitions = [];
  const file_ids = [];
  const monitor_info = [];
  const lengths = [];
  const tank_updates = [];
  const tank_summaries = [];
  const jumps = [];
  const time_in_zone = [];
  const activity_metrics = [];

  let workout = null;
  const workoutSteps = [];

  try {
    while (loopIndex < crcStart) {
      const { nextIndex, messageType, message } = readRecord(
        blob,
        messageTypes,
        developerFields,
        loopIndex,
        parserOptions,
        startDate,
        pausedTime
      );
      loopIndex = nextIndex;

      switch (messageType) {
        case 'lap':
          laps.push(message);
          break;
        case 'session':
          sessions.push(message);
          break;
        case 'event':
          if (message.event === 'timer') {
            if (message.event_type === 'stop_all') {
              lastStopTimestamp = message.timestamp;
            } else if (message.event_type === 'start' && lastStopTimestamp) {
              pausedTime += (message.timestamp - lastStopTimestamp) / 1000;
            }
          }
          events.push(message);
          break;
        case 'length':
          lengths.push(message);
          break;
        case 'hrv':
          hrv.push(message);
          break;
        case 'hr_zone':
          hr_zone.push(message);
          break;
        case 'power_zone':
          power_zone.push(message);
          break;
        case 'record':
          if (!startDate) {
            startDate = message.timestamp;
            message.elapsed_time = 0;
            message.timer_time = 0;
          }
          records.push(message);
          break;
        case 'field_description':
          fieldDescriptions.push(message);
          break;
        case 'device_info':
          device_infos.push(message);
          break;
        case 'developer_data_id':
          applications.push(message);
          break;
        case 'dive_gas':
          dive_gases.push(message);
          break;
        case 'course_point':
          course_points.push(message);
          break;
        case 'sport':
          sports.push(message);
          break;
        case 'file_id':
          if (message) file_ids.push(message);
          break;
        case 'definition':
          if (message) definitions.push(message);
          break;
        case 'monitoring':
          monitors.push(message);
          break;
        case 'monitoring_info':
          monitor_info.push(message);
          break;
        case 'stress_level':
          stress.push(message);
          break;
        case 'tank_update':
          tank_updates.push(message);
          break;
        case 'tank_summary':
          tank_summaries.push(message);
          break;
        case 'jump':
          jumps.push(message);
          break;
        case 'time_in_zone':
          time_in_zone.push(message);
          break;
        case 'activity_metrics':
          activity_metrics.push(message);
          break;
        case 'workout':
          workout = message;
          break;
        case 'workout_step':
          workoutSteps.push(message);
          break;
        default:
          break;
      }
    }
  } catch (e) {
    return {
      workout: null,
      workoutSteps: [],
      fileIds: file_ids,
      error: e?.message || 'Failed to parse FIT records.',
    };
  }

  workoutSteps.sort((a, b) => {
    const ia = a.message_index != null ? Number(a.message_index) : 0;
    const ib = b.message_index != null ? Number(b.message_index) : 0;
    return ia - ib;
  });

  return { workout, workoutSteps, fileIds: file_ids, sports };
}
