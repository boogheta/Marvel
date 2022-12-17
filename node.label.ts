import { Settings } from 'sigma/settings';
import { NodeDisplayData, PartialButFor } from 'sigma/types';

const PADDING = 4;

function splitLabel(label) {
  return label.replace(/.{10}\S*\s+/g, "$&|").split(/\s+\|/);
}

function biggestPiece(pieces) {
  let big = "";
  pieces.filter(piece => big.length < piece.length ? big = piece : null);
  return big;
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

  const lineHeight = size + PADDING;
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
  const pieces = data.label ? splitLabel(data.label) : [];

  data = { ...data, label: data.label || data.hoverLabel };

  context.font = `${weight} ${size}px ${font}`;

  // Then we draw the label background
  context.fillStyle = "#555";

  context.beginPath();
  if (!data.label)
    context.arc(data.x, data.y, data.size + PADDING / 2, 0, Math.PI * 2);
  else {
    const textWidth = context.measureText(biggestPiece(pieces)).width;
    const boxWidth = Math.round(textWidth + 5);
    const boxHeight = Math.round(pieces.length * (size + PADDING) + PADDING);

    const radius = Math.max(data.size + PADDING, boxHeight / 2);
    const angleRadian = Math.asin(boxHeight / 2 / radius);
    const xShift = Math.sqrt(
      Math.abs(Math.pow(radius, 2) - Math.pow(boxHeight / 2, 2))
    ),
      xMin = data.x + xShift,
      xMax = data.x + data.size + PADDING + boxWidth - boxHeight / 4,
      yMin = data.y - boxHeight / 2,
      yMax = data.y + boxHeight / 2;

    context.moveTo(xMin, yMax);
    context.lineTo(xMax, yMax);
    context.arc(xMax, data.y, boxHeight /2, -Math.PI / 2, Math.PI / 2);
    context.lineTo(xMax, yMin);
    context.lineTo(xMin, yMin);
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
  }
  context.closePath();
  context.fill();

  // And finally we draw the label
  drawLabel(context, data, settings);
}

export { drawLabel, drawHover };
