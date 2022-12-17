import { Settings } from 'sigma/settings';
import { NodeDisplayData, PartialButFor } from 'sigma/types';

function splitLabel(label) {
  return label.replace(/.{10}\S*\s+/g, "$&|").split(/\s+\|/);
}

function drawLabel(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>,
  settings: Settings
): void {
  if (!data.label) return;

  const size = data.labelSize || settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;
  const color = data.labelColor || settings.labelColor.color;
  const pieces = splitLabel(data.label);

  const x = data.x + data.size + 3;
  let y = data.y + size / (pieces.length > 1 ? 2 : 3);

  context.fillStyle = color;
  context.font = `${weight} ${size}px ${font}`;

  const lineHeight = size + 2;
  if (pieces.length > 1)
    y -= lineHeight * pieces.length / 3;

  pieces.forEach((piece, i) =>
    context.fillText(piece, x, y + i * lineHeight)
  );
}

function drawHover(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>,
  settings: Settings
): void {
  const size = data.labelSize || settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;

  data = { ...data, label: data.label || data.hoverLabel };

  context.font = `${weight} ${size}px ${font}`;

  // Then we draw the label background
  context.fillStyle = '#FFF';
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 8;
  context.shadowColor = '#000';

  const PADDING = 2;

  if (typeof data.label === 'string') {
    const textWidth = context.measureText(data.label).width;
    const boxWidth = Math.round(textWidth + 5);
    const boxHeight = Math.round(size + 2 * PADDING);
    const radius = Math.max(data.size, size / 2) + PADDING;

    const angleRadian = Math.asin(boxHeight / 2 / radius);
    const xDeltaCoord = Math.sqrt(
      Math.abs(Math.pow(radius, 2) - Math.pow(boxHeight / 2, 2))
    );

    context.beginPath();
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2);
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
    context.closePath();
    context.fill();
  }

  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 0;

  // And finally we draw the label
  drawLabel(context, data, settings);
}

export { drawLabel, drawHover };
