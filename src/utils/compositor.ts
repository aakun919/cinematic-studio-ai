// Cinematic Studio AI — Canvas コンポジッタ (Package 4: 実書き出し)
//
// frameState.ts の純粋な FrameState を Canvas 2D に描く薄い層。
// 描画規則は PreviewPanel の CSS 合成の翻訳:
// - 背景は黒
// - 映像レイヤーは object-fit: contain で全面に置き、
//   translate(x%, y%) scale() rotate() を中心基準で適用、
//   色補正は CSS filter 文字列を ctx.filter へ
// - クロスディゾルブの次レイヤーはその上に重ねる
// - ディップ・トゥ・ブラックは黒レイヤーの opacity
// - テキストは中央配置 + transform + textShadow 相当
//
// ctx.filter は Safari の対応が版により異なるため feature-detect し、
// 使えない環境では色補正なし (ジオメトリと opacity は正しく) で描く。

import type { FrameState, LayerState, TextLayerState } from './frameState.ts';
import { colorFilterCss } from './frameState.ts';

export interface LayerImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/** clipId → そのフレームで使う画像 (映像フレーム / 写真) */
export type FrameAssets = Map<string, LayerImage>;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** ctx.filter が実際に効く環境かどうか (未対応環境では undefined になる) */
export function isCtxFilterSupported(ctx: Ctx2D): boolean {
  return typeof (ctx as { filter?: unknown }).filter === 'string';
}

function drawLayer(
  ctx: Ctx2D,
  layer: LayerState,
  image: LayerImage,
  width: number,
  height: number,
  filterOk: boolean,
): void {
  if (layer.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  if (filterOk) {
    ctx.filter = colorFilterCss(layer.filter);
  }
  // CSS の translate(%) は要素自身のサイズ比。レイヤーは全面 (inset: 0) なので
  // フレーム寸法に対する比として解釈する。原点は中心 (transform-origin: center)。
  const cx = width / 2 + (layer.values.positionX / 100) * width;
  const cy = height / 2 + (layer.values.positionY / 100) * height;
  ctx.translate(cx, cy);
  ctx.scale(layer.values.scale, layer.values.scale);
  ctx.rotate((layer.values.rotation * Math.PI) / 180);
  // object-fit: contain
  const fit = Math.min(width / image.width, height / image.height);
  const dw = image.width * fit;
  const dh = image.height * fit;
  ctx.drawImage(image.source, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function drawTextLayer(
  ctx: Ctx2D,
  layer: TextLayerState,
  width: number,
  height: number,
): void {
  const clip = layer.clip;
  if (!clip.text || layer.opacity <= 0) return;
  // プレビューの fontSize はステージ高 720 前提の見た目に合わせ、
  // 高さ比でスケールする (プレビュー側の 0.75 係数を含む)
  const unit = height / 720;
  const fontPx = (clip.fontSize || 36) * 0.75 * unit;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  const cx = width / 2 + (layer.values.positionX / 100) * width;
  const cy = height / 2 + (layer.values.positionY / 100) * height;
  ctx.translate(cx, cy);
  ctx.scale(layer.values.scale, layer.values.scale);
  ctx.rotate((layer.values.rotation * Math.PI) / 180);
  ctx.font = `700 ${fontPx}px ${clip.fontFamily || 'sans-serif'}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = clip.textAlign || 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 16 * unit;
  ctx.shadowOffsetY = 2 * unit;
  const lines = clip.text.split('\n');
  const lineHeight = fontPx * 1.25;
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lineHeight);
  });
  ctx.restore();
}

/** 1 フレームを描く。背景 (黒) → 主レイヤー → 遷移先 → 黒ディップ → テキスト */
export function renderFrame(
  ctx: Ctx2D,
  state: FrameState,
  assets: FrameAssets,
  width: number,
  height: number,
): void {
  const filterOk = isCtxFilterSupported(ctx);
  ctx.save();
  ctx.globalAlpha = 1;
  if (filterOk) ctx.filter = 'none';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  if (state.primary) {
    const image = assets.get(state.primary.clip.id);
    if (image) drawLayer(ctx, state.primary, image, width, height, filterOk);
  }
  if (state.next) {
    const image = assets.get(state.next.clip.id);
    if (image) drawLayer(ctx, state.next, image, width, height, filterOk);
  }
  if (state.dipToBlack > 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, state.dipToBlack));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (state.text) {
    drawTextLayer(ctx, state.text, width, height);
  }
}
