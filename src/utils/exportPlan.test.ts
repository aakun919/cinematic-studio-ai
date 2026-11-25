import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideExportSupport,
  pickFormat,
  exportDimensions,
  isResolutionEnabled,
  type CodecSupport,
} from './exportPlan.ts';

const ALL: CodecSupport = { avc: true, hevc: true, aac: true, opus: true };
const NONE: CodecSupport = { avc: false, hevc: false, aac: false, opus: false };

describe('Package 4 — decideExportSupport', () => {
  it('全対応なら H.264 / HEVC が選べ、ProRes は常時無効、音声は AAC', () => {
    const d = decideExportSupport(ALL);
    assert.equal(d.canExport, true);
    assert.equal(d.blockingReason, null);
    assert.equal(d.audioCodec, 'aac');
    assert.equal(d.formats.find(f => f.format === 'h264')?.available, true);
    assert.equal(d.formats.find(f => f.format === 'hevc')?.available, true);
    const prores = d.formats.find(f => f.format === 'prores');
    assert.equal(prores?.available, false);
    assert.ok(prores?.note?.includes('Tauri'));
  });

  it('AAC 不可なら Opus にフォールバックする', () => {
    const d = decideExportSupport({ ...ALL, aac: false });
    assert.equal(d.audioCodec, 'opus');
  });

  it('音声コーデックが両方不可でも映像が書ければ canExport は true (音声は null)', () => {
    const d = decideExportSupport({ ...ALL, aac: false, opus: false });
    assert.equal(d.audioCodec, null);
    assert.equal(d.canExport, true);
  });

  it('映像コーデックが両方不可なら canExport は false で理由が付く', () => {
    const d = decideExportSupport(NONE);
    assert.equal(d.canExport, false);
    assert.ok(d.blockingReason && d.blockingReason.length > 0);
    assert.equal(d.audioCodec, null);
  });

  it('HEVC のみの環境でも書き出せる', () => {
    const d = decideExportSupport({ ...NONE, hevc: true });
    assert.equal(d.canExport, true);
    assert.equal(d.formats.find(f => f.format === 'h264')?.available, false);
    assert.equal(d.formats.find(f => f.format === 'hevc')?.available, true);
  });
});

describe('Package 4 — pickFormat', () => {
  it('希望形式が使えればそのまま', () => {
    const d = decideExportSupport(ALL);
    assert.equal(pickFormat(d, 'h264'), 'h264');
    assert.equal(pickFormat(d, 'hevc'), 'hevc');
  });

  it('ProRes 希望は H.264 にフォールバックする', () => {
    const d = decideExportSupport(ALL);
    assert.equal(pickFormat(d, 'prores'), 'h264');
  });

  it('H.264 不可なら HEVC、両方不可なら null', () => {
    assert.equal(pickFormat(decideExportSupport({ ...NONE, hevc: true }), 'h264'), 'hevc');
    assert.equal(pickFormat(decideExportSupport(NONE), 'h264'), null);
  });
});

describe('Package 4 — exportDimensions', () => {
  it('1080p / 16:9 は 1920×1080', () => {
    assert.deepEqual(exportDimensions('1080p', '16:9'), { width: 1920, height: 1080 });
  });
  it('720p / 9:16 は幅基準で 720×1280', () => {
    assert.deepEqual(exportDimensions('720p', '9:16'), { width: 720, height: 1280 });
  });
  it('1080p / 4:3 は 1440×1080、1:1 は 1080×1080', () => {
    assert.deepEqual(exportDimensions('1080p', '4:3'), { width: 1440, height: 1080 });
    assert.deepEqual(exportDimensions('1080p', '1:1'), { width: 1080, height: 1080 });
  });
  it('720p / 21:9 は 1680×720 (偶数丸め)', () => {
    assert.deepEqual(exportDimensions('720p', '21:9'), { width: 1680, height: 720 });
  });
});

describe('Package 4 — isResolutionEnabled', () => {
  it('4K は段階導入のため無効、1080p / 720p は有効', () => {
    assert.equal(isResolutionEnabled('4k'), false);
    assert.equal(isResolutionEnabled('1080p'), true);
    assert.equal(isResolutionEnabled('720p'), true);
  });
});
